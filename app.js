
// todo:
// need to test rules that depend on other regions before those are queried
// need to make sure report stays consistent during startup, election, and failover
//    for example, what happens if rules depend on other regions
// when changing roles, have it immediately query

// includes
const verror = require("verror");
const os = require("os");
const dns = require("dns");
const util = require("util");
const argv = require("minimist")(process.argv.slice(2));
const fs = require("fs");
const q = require("q");
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

// logging
global.loglevel = (argv["log-level"] || "error").betweenInt(0, 4, [ "error", "warn", "info", "verbose", "debug" ]);
var most_verbose_to_log = "error";
switch (global.loglevel) {
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

// get the desired instance name
if (argv.instance == null) {
    throw new verror("10001: the instance must be specified.");
}
var instance = argv.instance;

// phase 1 - discovery
const phase_1 = q.defer();
var discovered_instances = null;
const discover_port = argv["discover-port"]; 
const discover_dns = argv["discover-dns"];
if (typeof discover_dns == "string" && typeof discover_port == "number") {

    // lookup the provided dns name for round-robin addresses
    dns.lookup(discover_dns, {
        family: 4,
        all: true
    }, function(error, addresses) {
        if (!error) {
            if (addresses.length > 0) {

                // create the instance array
                addresses.sort(function(a, b) {
                    return a.address.localeCompare(b.address);
                });
                var instance_count = 0;
                discovered_instances = addresses.map(function(a) {
                    const entry = {
                        name: instance + "." + instance_count,
                        port: parseInt(discover_port),
                        fqdn: a.address
                    }
                    console.info("instance discovered to be (name: %s, FQDN: %s).", entry.name, entry.fqdn);
                    instance_count++;
                    return entry;
                });

                // see if any of those names match the current system
                const nics = os.networkInterfaces();
                Object.keys(nics).forEach(function(key) {
                    const nic = nics[key];
                    nic.forEach(function(entry) {
                        const found = discovered_instances.find(function(a) { return a.fqdn == entry.address });
                        if (found) {
                            console.info("local instance was identified as (name: %s, FQDN: %s).", found.name, found.fqdn);
                            instance = found.name;
                        }
                    });
                });

                // make sure one of the entries was local
                if (discovered_instances.find(function(a) { return a.name == instance }) == null) {
                    throw new verror(error, "10002: none of the discover DNS entries (%s) matched an address on this system.", discover_dns); 
                }

                phase_1.resolve();
            } else {
                throw new verror(error, "10003: the discover DNS entry (%s) did not find any addresses.", discover_dns);
            }
        } else {
            throw new verror(error, "10004: the discover DNS entry (%s) could not be resolved.", discover_dns);
        }
    });
} else {
    phase_1.resolve();
}

// phase-2 - configuration
phase_1.promise.then(function () {
    fs.readdir("./config", function(error, files) {
        if (!error) {

            // --config-prefix can specify that only specific files are loaded
            const filtered_files = [];
            const config_prefix = (argv["config-prefix"]) ? argv["config-prefix"] : null;
            files.forEach(function(file) {
                if (!config_prefix) {
                    filtered_files.push(file);
                } else {
                    const found = config_prefix.split(",").find(function(prefix) { return file.startsWith(prefix) });
                    if (found) filtered_files.push(file);
                }
            });

            // load all configuration files
            region_manager.load(filtered_files).then(function(regions) {
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
                            region_manager.validate(context, argv); // must be first
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

                            // add "all" endpoint that shows everything that the instance knows about
                            app.get("/all", function(req, res) {
                                const all = {
                                    instance: {
                                        name: region_manager.region.instance.name,
                                        uuid: region_manager.region.instance.uuid
                                    },
                                    regions: []
                                }
                                region_manager.regions.forEach(function(region) {
                                    const r = {
                                        name: region.name,
                                        instances: [],
                                        services: []
                                    }
                                    region.instances.forEach(function(instance) {
                                        const i = {
                                            name: instance.name,
                                            url: "http://" + instance.fqdn + ":" + instance.port,
                                            isConnected: instance.isConnected
                                        }
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
                                    all.regions.push(r);
                                });
                                if (region_manager.region.instance.isMaster) {
                                    all.source = "master";
                                } else {
                                    const master = region_manager.region.instances.find(function(instance) { return instance.isMaster && instance.isConnected });
                                    all.source = "slave";
                                    if (master) all.master = "http://" + master.fqdn + ":" + master.port + "/all";
                                }
                                res.send(all);
                            });

                            // add "elect" endpoint that allows instances to elect a master
                            app.post("/elect", function(req, res) {
                                if (global.loglevel >= 4) {
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
});

process.on("uncaughtException", function(ex) {
    console.error(verror.fullStack(ex));
    process.exit();
});
