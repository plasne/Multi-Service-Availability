
// todo:
// if there is a "should-init" status for the property then it should immediately poll for everything
//    helps with startup and failover
// need to test rules that depend on other regions before those are queried
// need to make sure report stays consistent during startup, election, and failover
//    for example, what happens if rules depend on other regions

// includes
const argv = require("minimist")(process.argv.slice(2));
const fs = require("fs");
const express = require("express");
const bodyparser = require("body-parser");
const events = require("events");
const service_manager = require("./lib/service.js");
const region_manager = require("./lib/region.js");
const condition_manager = require("./lib/condition.js");
const rule_manager = require("./lib/rule.js");

// globals
const app = express();
app.use(bodyparser.json());

// extend String with a replaceAll method
String.prototype.escapeAsRegExp = function() {
    const target = this;
    return target.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
String.prototype.replaceAll = function(find, replace) { // case insensitive
    const target = this;
    return target.replace(new RegExp(find.escapeAsRegExp(), "gi"), replace);
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

// read the configuration files
fs.readdir("./config", function(error, files) {
    if (!error) {

        // --config-prefix can specify that only specific files are loaded
        const filtered_files = [];
        const config_prefix = (argv["config-prefix"]) ? argv["config-prefix"] : null;
        files.forEach(function(file) {
            if (file.startsWith("sample.")) {
                // skip
            } else if (!config_prefix) {
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

                        // validate
                        region_manager.validate(argv);

                        // build a context object that can be passed as needed
                        const context = {
                            events: new events(),
                            regions: regions,
                            region: region_manager.region,
                            rules: rules,
                            conditions: conditions,
                            services: services
                        };

                        // start listening for service changes
                        rule_manager.start(context);

                        // start polling
                        service_manager.start(context);
                        region_manager.start(context);

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

                        // add "all" endpoint that shows everything or redirects to a node that can provide everything
                        app.get("/all", function(req, res) {
                            const all = { };
                            if (region_manager.region.instance.isMaster) {
                                all.source = "master";
                            } else {
                                const master = region_manager.region.instances.find(function(instance) { return instance.isMaster && instance.isConnected });
                                if (master) {
                                    res.redirect("http://" + master.fqdn + ":" + master.port + "/all");
                                } else {
                                    all.source = "slave";
                                }
                            }
                            if (all.source) {
                                all.regions = [];
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
                                        if (region.isLocal) i.isMaster = instance.isMaster;
                                        r.instances.push(i);
                                    });
                                    service_manager.services.forEach(function(service) {
                                        const fqn = service.fqn.split(".");
                                        if (fqn[0] == region.name) {
                                            const s = {
                                                name: service.name,
                                                state: service.state,
                                                report: service.report,
                                                properties: service.properties
                                            }
                                            r.services.push(s);
                                        }
                                    });
                                    all.regions.push(r);
                                });
                                res.send(all);
                            }
                        });

                        // add "elect" endpoint that allows instances to elect a master
                        app.post("/elect", function(req, res) {
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
                                        res.send({
                                            isMaster: false,
                                            services: service_manager.inventory({ remote: false, state: false, properties: false })
                                        });
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
                    });
                });
            });
        });

    } else {
        throw error;
    }
});
