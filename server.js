
// includes
var argv = require("minimist")(process.argv.slice(2));
var fs = require("fs");
var express = require("express");
var service_manager = require("./lib/service.js");
var region_manager = require("./lib/region.js");
var condition_manager = require("./lib/condition.js");
var rule_manager = require("./lib/rule.js");

// globals
var app = express();

// extend String with a replaceAll method
String.prototype.escapeAsRegExp = function() {
    var target = this;
    return target.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
String.prototype.replaceAll = function(find, replace) { // case insensitive
    var target = this;
    return target.replace(new RegExp(find.escapeAsRegExp(), "gi"), replace);
}

// read the configuration files
fs.readdir("./config", function(error, files) {
    if (!error) {

        // --config-prefix can specify that only specific files are loaded
        var filtered_files = [];
        var config_prefix = (argv["config-prefix"]) ? argv["config-prefix"] : null;
        files.forEach(function(file) {
            if (file.startsWith("sample.")) {
                // skip
            } else if (!config_prefix) {
                filtered_files.push(file);
            } else if (file.startsWith(config_prefix)) {
                filtered_files.push(file);
            }
        });

        // load all configuration files
        region_manager.load(filtered_files).then(function(regions) {
            condition_manager.load(filtered_files).then(function(conditions) {
                rule_manager.load(filtered_files).then(function(rules) {
                    service_manager.load(filtered_files, rule_manager).then(function(services) {

                        // start listening for service changes
                        rule_manager.start(rules, conditions, services);

                        // start service polling
                        services.forEach(function(service) {
                            service.in.start();
                        });

                        // start rule polling
                        /*
                        setInterval(function() {
                                rule.evaluate(rules, conditions, services)
                            }, 5000);
                        */
                        console.log("done loading...");
                    });
                });
            });
        });

        //console.log(files);
    } else {
        throw error;
    }
});

app.get("/", function(req, res) {
    res.send("hello");
});

console.dir(argv);

// startup the web services
app.listen(80, function() {
    console.log("listening on port 80...");
});