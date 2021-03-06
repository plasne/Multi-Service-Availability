
// includes
const q = require("q");
const verror = require("verror");
const util = require("util");
const argv = require("minimist")(process.argv.slice(2));
const fs = require("fs");
const express = require("express");
const http = require("http");
const https = require("https");
const bodyparser = require("body-parser");
const events = require("events");
const security = require("./lib/security.js");
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

// extend Array with a removeIf
Array.prototype.removeIf = function(callback) {
    var i = this.length;
    while (i--) {
        if (callback(this[i], i)) {
            this.splice(i, 1);
        }
    }
};

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
    mode: argv["mode"],
    secret: argv["secret"],
    certificate_passphrase: argv["certificate-passphrase"],
    certificate_authority: argv["certificate-authority"],
    protocol: "http"
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
        security.readCertificateAndKey().then(function(https_options) {
            region_manager.load(filtered_files).then(function(regions) {
                condition_manager.load(filtered_files).then(function(conditions) {
                    rule_manager.load(filtered_files).then(function(rules) {
                        service_manager.load(filtered_files).then(function(services) {

                            // build a context object that can be passed as needed
                            const context = {
                                events: new events(),
                                regions: regions,
                                region: null,
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
                                    isMaster: region_manager.region.instance.isMaster
                                }
                                if (region_manager.region.instance.isMaster) {
                                    security.authenticate(req, region_manager.region.key).then(function(resolved) {
                                        query.services = service_manager.services.reduce(function(result, service) {
                                            if (service.isLocal) {
                                                result.push({
                                                    name: service.name,
                                                    priority: service.priority,
                                                    state: service.state,
                                                    report: service.report,
                                                    properties: service.properties
                                                });
                                            }
                                            return result;
                                        }, []);
                                        res.send(query);
                                    }, function(ex) {
                                        console.error(new verror(ex, "query request from (%s) could not be authenticated.", req.ip).message);
                                        res.status(401).end();    
                                    });
                                } else if (global.msa_settings.mode == "proxy") {
                                    const instance = region_manager.region.instances.find(function(i) { return i.isMaster; });
                                    if (instance) {
                                        instance.query.headers.Authorization = req.get("Authorization");
                                        instance.query.execute().then(function(result) {
                                            res.send(result.body);
                                        }, function(error) {
                                            if (error.response && error.response.statusCode) {
                                                res.status(error.response.statusCode).send(error);
                                            } else {
                                                res.status(500).send(error);
                                            }
                                        }).done();
                                    } else {
                                        res.send(query);
                                    }
                                } else {
                                    res.send(query);
                                }
                            });

                            // used by the all methods to return all information about the current instance
                            const all = function() {
                                const data = {
                                    instance: {
                                        name: region_manager.region.instance.name,
                                    },
                                    regions: []
                                }
                                if (global.msa_settings.mode == "proxy") data.use_proxy = true;
                                region_manager.regions.forEach(function(region) {
                                    const r = {
                                        name: region.name,
                                        instances: [],
                                        services: []
                                    }
                                    region.instances.forEach(function(instance) {
                                        const i = {
                                            name: instance.name,
                                            isMaster: instance.isMaster,
                                            isConnected: instance.isConnected
                                        }
                                        i.url = (region.isLocal && global.msa_settings.mode == "proxy") ?
                                            "/all/" + instance.name :
                                            "http://" + instance.fqdn + ":" + instance.port;
                                        r.instances.push(i);
                                    });
                                    service_manager.services.forEach(function(service) {
                                        const fqn = service.fqn.split(".");
                                        if (fqn[0] == region.name) {
                                            const s = {
                                                name: fqn[1],
                                                state: service.state,
                                                report: service.report,
                                                properties: service.properties,
                                                priority: service.priority
                                            }
                                            if (service.isLocal && service.in) s.url = service.in.query.uri;
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
                                            res.send(all());
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
                                    security.authenticate(req, region_manager.region.key).then(function(resolved) {
                                        const instance = region_manager.find(req.body.region, req.body.instance);
                                        if (instance && instance != region_manager.region.instance) {
                                            instance.isConnected = true;
                                            instance.isMaster = req.body.isMaster;
                                            instance.masterSince = req.body.masterSince;
                                            region_manager.region.elect();
                                            if (instance.isMaster) {
                                                res.send({ isMaster: true });
                                            } else {
                                                const o = { isMaster: false };
                                                if (region_manager.region.instance.isMaster) {
                                                    o.services = service_manager.services.reduce(function(result, service) {
                                                        if (service.isLocal) {
                                                            result.push({
                                                                name: service.name,
                                                                report: service.report
                                                            });
                                                        }
                                                        return result;
                                                    }, []);
                                                }
                                                res.send(o);
                                            }
                                        } else {
                                            res.status(500).send({ error: "region (" + req.body.region + ") and instance (" + req.body.instance + ") not found." });
                                        }
                                    }, function(ex) {
                                        console.error(new verror(ex, "election request from (%s) could not be authenticated.", req.ip).message);
                                        res.status(401).end();    
                                    });
                                } else {
                                    res.status(500).send({ error: "region (" + req.body.region + ") not valid." });
                                }
                            });

                            // add "sync" endpoint that can accept changes from other instances
                            app.post("/sync", function(req, res) {
                                if (region_manager.region.instance.isMaster) {
                                    res.status(500).send({ error: "target region is a master" });
                                } else if (req.body.region == region_manager.region.name) {
                                    security.authenticate(req, region_manager.region.key).then(function(resolved) {
                                        service_manager.update(context, req.body.services);
                                        res.status(200).end();
                                    }, function(ex) {
                                        console.error(new verror(ex, "sync request from (%s) could not be authenticated.", req.ip).message);
                                        res.status(401).end();    
                                    });
                                } else {
                                    res.status(500).send({ error: "region not valid" });
                                }
                            });

                            // add "report" endpoint that provides a load balancer with the report state in a way it can understand
                            app.get("/report/:service", function(req, res) {
                                const service = service_manager.services.find(function(s) { return (s.isLocal && s.name == req.params.service) });
                                if (service) {
                                    const report = function() {
                                        if (service.out) {
                                            var match = service.out.results.find(function(result) { return result.isMatch(service.report) });
                                            if (match) {
                                                res.status(match.responses[0]).send({ name: service.name, state: service.report });
                                            } else {
                                                res.status(500).send({ error: "service (" + req.params.service + ") with report (" + service.report + ") could not be matched to a response." });
                                            } 
                                        } else {
                                            res.status(404).send({ error: "service (" + req.params.service + ") does not have a reporting endpoint." });
                                        }
                                    }
                                    if (service.report == null) { // allow the connection to block for up to 1 min before returning unknown results
                                        var waitedFor = 0;
                                        var waitOnReport = function() {
                                            waitedFor += 200;
                                            if (service.report == null && waitedFor < 60000) {
                                                setTimeout(waitOnReport, 200);
                                            } else {
                                                console.info("the request for /report/%s was held for %d seconds to determine the report status of '%s'.", req.params.service, Math.ceil(waitedFor / 1000), service.report);
                                                report();
                                            }
                                        }
                                        console.info("a request for /report/%s could not be completed immediately since the report status is 'unknown'. The connection will be held open for up to 60 seconds while the status is determined.", req.params.service);
                                        setTimeout(waitOnReport, 200);
                                    } else {
                                        report();
                                    }
                                } else {
                                    res.status(404).send({ error: "service (" + req.params.service + ") not found." });
                                }
                            });

                            // startup the server
                            try {
                                if (https_options) {
                                    https.createServer(https_options, app).listen(region_manager.region.instance.port, function() {
                                        console.log("listening on https://:" + region_manager.region.instance.port + "...");
                                    });
                                } else {
                                    http.createServer(app).listen(region_manager.region.instance.port, function() {
                                        console.log("listening on http://:" + region_manager.region.instance.port + "...");
                                    });
                                }
                            } catch (ex) {
                                throw new verror(ex, "10011: the web server could not be started.");
                            }

                            console.log("done loading...");
                        }).done();
                    }).done();
                }).done();
            }).done();
        }).done();

    } else {
        throw new verror(error, "10021: the files in the config directory could not loaded.");
    }
});

process.on("uncaughtException", function(ex) {
    console.error(verror.fullStack(ex));
    process.exit();
});
