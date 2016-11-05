
// todo:
// need to test rules that depend on other regions before those are queried
// need to make sure report stays consistent during startup, election, and failover
//    for example, what happens if rules depend on other regions
// when changing roles, have it immediately query

// includes
const verror = require("verror");
const util = require("util");
const argv = require("minimist")(process.argv.slice(2));
const fs = require("fs");
const express = require("express");
const bodyparser = require("body-parser");
const events = require("events");
const service_manager = require("./lib/service.js");
const region_manager = require("./lib/region.js");
const condition_manager = require("./lib/condition.js");
const rule_manager = require("./lib/rule.js");

// extend String with a replaceAll method
String.prototype.escapeAsRegExp = function() {
    const target = this;
    return target.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
String.prototype.replaceAll = function(find, replace) { // case insensitive
    const target = this;
    return target.replace(new RegExp(find.escapeAsRegExp(), "gi"), replace);
}

// extend String with a format option
String.prototype.format = function() {
    var s = this;
    const args = Array.prototype.slice.call(arguments);
    args.unshift(this.toString());
    return util.format.apply(null, args);
}

// extend Array with an equal
Array.prototype.isEqual = function(compareTo) {
    const source = this;
    if (source === compareTo) return true;
    if (source == null || compareTo == null) return false;
    if (source.length != compareTo.length) return false;
    for (var i = 0; i < source.length; i++) {
        if (compareTo.indexOf(source[i]) < 0) return false;
    }
    return true;
}

// extend Number with between
String.prototype.betweenInt = function(min, max, map) {
    var target = this.toString();
    if (Array.isArray(map) && isNaN(target)) {
        target = map.indexOf(target);
    }
    return Math.min(Math.max(parseInt(target), min), max)
}

// get any settings
if (argv.instance == null) {
    throw new verror("10001: the instance must be specified.");
}
global.msa_settings = {
    loglevel: (argv["log-level"] || "error").betweenInt(0, 4, [ "error", "warn", "info", "verbose", "debug" ]),
    instance: argv.instance,
    discover_port: argv["discover-port"], 
    discover_dns: argv["discover-dns"],
    config_prefix: argv["config-prefix"],
    management_mode: argv["management-mode"]
}

// logging
var most_verbose_to_log = "error";
switch (global.msa_settings.loglevel) {
    case 1: // warn
        most_verbose_to_log = "warn";
        console.log("log level set to error and warn.");
        break;
    case 2: // info
        most_verbose_to_log = "info";
        console.log("log level set to error, warn, and info.");
        break;
    case 3: // verbose
        most_verbose_to_log = "log";
        console.log("log level set to error, warn, info, and verbose.");
        break;
    case 4: // debug
        most_verbose_to_log = "log";
        console.log("log level set to error, warn, info, verbose, and debug.");
        break;
    default: // error
        console.log("log level set to error only.");
        break;
}
require("console-stamp")(console, { pattern: "mm/dd HH:MM:ss.l", level: most_verbose_to_log });

// express configuration
const app = express();
app.use(express.static("web"));
app.use(bodyparser.json());

// load configuration files
fs.readdir("./config", function(error, files) {
    if (!error) {

        // --config-prefix can specify that only specific files are loaded
        const filtered_files = [];
        files.forEach(function(file) {
            if (!global.msa_settings.config_prefix) {
                filtered_files.push(file);
            } else {
                const found = global.msa_settings.config_prefix.split(",").find(function(prefix) { return file.startsWith(prefix) });
                if (found) filtered_files.push(file);
            }
        });

        // load all configuration files
        region_manager.load(filtered_files).then(function(regions, discovered_instances) {
            condition_manager.load(filtered_files).then(function(conditions) {
                rule_manager.load(filtered_files).then(function(rules) {
                    service_manager.load(filtered_files).then(function(services) {

                        // build a context object that can be passed as needed
                        const context = {
                            events: new events(),
                            regions: regions,
                            rules: rules,
                            conditions: conditions,
                            services: services
                        };

                        // validate
                        region_manager.validate(context); // must be first
                        service_manager.validate(context); // must be before conditions and rules
                        condition_manager.validate(context);
                        rule_manager.validate(context);

                        // startup
                        rule_manager.start(context); // must be first
                        service_manager.start(context);
                        region_manager.start(context);

                        // redirect to the endpoint that can show stats
                        app.get("/", function(req, res) {
                            res.redirect("/default.htm");
                        });

                        // add "query" endpoint that can be polled by other regions
                        app.get("/query", function(req, res) {
                            const query = {
                                region: region_manager.region.name,
                            }
                            if (region_manager.region.instance.isMaster) {
                                query.services = service_manager.inventory({ remote: false, fqn: false });
                            }
                            res.send(query);
                        });

                        // used by the all methods to return all information about the current instance
                        const all = function() {
                            const data = {
                                instance: {
                                    name: region_manager.region.instance.name,
                                    uuid: region_manager.region.instance.uuid
                                },
                                regions: []
                            }
                            if (global.msa_settings.management_mode == "proxy") data.use_proxy = true;
                            region_manager.regions.forEach(function(region) {
                                const r = {
                                    name: region.name,
                                    instances: [],
                                    services: []
                                }
                                region.instances.forEach(function(instance) {
                                    const i = {
                                        name: instance.name,
                                        isConnected: instance.isConnected
                                    }
                                    i.url = (global.msa_settings.management_mode == "proxy") ?
                                        "/all/" + instance.name :
                                        "http://" + instance.fqdn + ":" + instance.port;
                                    if (region.isLocal) i.isMaster = instance.isMaster;
                                    r.instances.push(i);
                                });
                                service_manager.services.forEach(function(service) {
                                    const fqn = service.fqn.split(".");
                                    if (fqn[0] == region.name) {
                                        const s = {
                                            name: fqn[1],
                                            state: service.state,
                                            report: service.report,
                                            properties: service.properties
                                        }
                                        if (service.isLocal && service.in.query) s.url = service.in.query.uri;
                                        r.services.push(s);
                                    }
                                });
                                data.regions.push(r);
                            });
                            return data;
                        }

                        // add "all" endpoint that shows everything that the instance knows about
                        app.get("/all", function(req, res) {
                            res.send(all());
                        });

                        // a proxy that regions the "all" endpoint of the desired instance
                        app.get("/all/:instance", function(req, res) {
                            if (req.params.instance == region_manager.region.instance) {
                                res.send(all());
                            } else {
                                try {
                                    const instance = region_manager.find(null, req.params.instance);
                                    if (instance) {
                                        instance.all.execute().then(function(result) {
                                            res.send(result.body);
                                        }, function(error) {
                                            if (error.response && error.response.statusCode) {
                                                res.status(error.response.statusCode).send(error);
                                            } else {
                                                res.status(500).send(error);
                                            }
                                        }).done();
                                    } else {
                                        res.status(404).end();
                                    }
                                } catch (ex) {
                                    res.status(500).send({ error: ex.message });
                                }
                            }
                        });

                        // add "elect" endpoint that allows instances to elect a master
                        app.post("/elect", function(req, res) {
                            if (global.msa_settings.loglevel >= 4) {
                                console.log("ELECTION REQUEST:");
                                console.log(req.body);
                            }
                            if (req.body.region == region_manager.region.name) {
                                const instance = region_manager.find(req.body.region, req.body.instance);
                                if (instance && instance != region_manager.region.instance) {
                                    instance.uuid = req.body.uuid;
                                    instance.isConnected = true;
                                    instance.isMaster = req.body.isMaster;
                                    region_manager.region.elect();
                                    if (instance.isMaster) {
                                        res.send({ isMaster: true });
                                    } else {
                                        const o = { isMaster: false };
                                        if (region_manager.region.instance.isMaster) o.services = service_manager.inventory({ remote: false, state: false, properties: false })
                                        res.send(o);
                                    }
                                } else {
                                    res.status(500).send({ error: "region/instance not found" });
                                }
                            } else {
                                res.status(500).send({ error: "region not valid" });
                            }
                        });

                        // add "sync" endpoint that can accept changes from other instances
                        app.post("/sync", function(req, res) {
                            if (req.body.region == region_manager.region.name) {
                                service_manager.update(context, req.body.services);
                            } else {
                                res.status(500).send({ error: "region not valid" });
                            }
                        });

                        //setInterval(function() {
                            //console.log("*************");
                            //services.forEach(function(service) {
                                //console.log(service.fqn + " s:" + service.state + " r:" + service.report);
                            //});
                        //}, 10000);

                        // startup the server
                        app.listen(region_manager.region.instance.port, function() {
                            console.log("listening on port " + region_manager.region.instance.port + "...");
                        });

                        console.log("done loading...");
                    }).done();
                }).done();
            }).done();
        }).done();

    } else {
        throw error;
    }
});

process.on("uncaughtException", function(ex) {
    console.error(verror.fullStack(ex));
    process.exit();
});
