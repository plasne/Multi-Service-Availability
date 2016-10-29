var express = require("express");
var service = require("./lib/service.js");

var app = express();

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
                "responses": [ "200", "201-206" ],
                "state": "up"
            },
            {
                "state": "down"
            }
        ]
    }
});

app.get("/", function(req, res) {
    res.send("hello");
});

app.listen(80, function() {
    console.log("listening on port 80...");
});