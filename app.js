
// includes
const argv = require("minimist")(process.argv.slice(2));
const fs = require("fs");
const express = require("express");
const service_manager = require("./lib/service.js");
const region_manager = require("./lib/region.js");
const condition_manager = require("./lib/condition.js");
const rule_manager = require("./lib/rule.js");

// globals
const app = express();

// extend String with a replaceAll method
String.prototype.escapeAsRegExp = function() {
    const target = this;
    return target.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
String.prototype.replaceAll = function(find, replace) { // case insensitive
    const target = this;
    return target.replace(new RegExp(find.escapeAsRegExp(), "gi"), replace);
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
                    service_manager.load(filtered_files, rule_manager).then(function(services) {

                        // validate
                        region_manager.validate();

                        // determine the local instance
                        if (region_manager.local.instances.length > 0 && argv.instance == null) {
                            console.log("10001: the instance must be specified.");
                            throw new Error("10001: the instance must be specified.");
                        }
                        const instance = region_manager.local.instances.find(function(instance) { return instance.name == argv.instance });
                        if (instance == null) {
                            console.log("10001: the specified instance (" + argv.instance + ") could not be found.");
                            throw new Error("10001: the specified instance (" + argv.instance + ") could not be found.");
                        }

                        // build a context object that can be passed as needed
                        const context = {
                            regions: regions,
                            region: region_manager.local,
                            instance: instance,
                            rules: rules,
                            conditions: conditions,
                            services: services
                        };

                        // start listening for service changes
                        const wait = region_manager.local["process-after-idle"];
                        rule_manager.start(wait, context);

                        // start service polling
                        service_manager.start();

                        // startup the server
                        app.listen(instance.port, function() {
                            console.log("listening on port " + instance.port + "...");
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

app.get("/", function(req, res) {
    res.send("hello");
});
