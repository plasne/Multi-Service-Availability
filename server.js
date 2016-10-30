
// includes
var fs = require("fs");
var express = require("express");
var service = require("./lib/service.js");
var region = require("./lib/region.js");
var condition = require("./lib/condition.js");
var rule = require("./lib/rule.js");

// globals
var app = express();

// read the configuration files
fs.readdir("./config", function(error, files) {
    if (!error) {

        // load all configuration files
        region.load(files).then(function(regions) {
            service.load(files).then(function(services) {
                condition.load(files).then(function(conditions) {
                    rule.load(files).then(function(rules) {

                        // start service polling
                        services.forEach(function(s) {
                            s.in.start();
                        });

                        // start rule polling
                        setInterval(function() {
                                rule.evaluate(rules, conditions, services)
                            }, 5000);

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

// startup the web services
app.listen(80, function() {
    console.log("listening on port 80...");
});