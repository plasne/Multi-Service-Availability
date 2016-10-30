
// includes
var fs = require("fs");
var express = require("express");
var service = require("./lib/service.js");
var region = require("./lib/region.js");
var condition = require("./lib/condition.js");

// globals
var app = express();

// read the configuration files
fs.readdir("./config", function(error, files) {
    if (!error) {

        // load the regions
        region.load(files).then(function() {
            service.load(files).then(function() {
                condition.load(files).then(function() {
                    console.log("done loading...");
                });
            });
        });

        //console.log(files);
    } else {
        throw error;
    }
});

/*
var s = service.new({
    name: "bob",
    priority: 40,
    in: {
        poll: 2000,
        query: {
            uri: "http://pelasne-node01.eastus.cloudapp.azure.com"
        },
        results: [
            {
                "response": "200-206",
                "state": "up"
            },
            {
                "state": "down"
            }
        ]
    }
});
*/

app.get("/", function(req, res) {
    res.send("hello");
});

// startup the web services
app.listen(80, function() {
    console.log("listening on port 80...");
});