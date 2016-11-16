
var express = require("express");
var request = require("request");
var app = express();

app.use(express.static("files"));

app.get("/", function(req, res) {
    res.redirect("/default.htm");
});

app.get("/name", function(req, res) {
    request({
        uri: "http://app/name"
    }, function(error, response, body) {
        if (!error) {
            res.status(response.statusCode).send(body);
        } else {
            res.status(500).send(error);
        }
    });
});

app.listen(80, function() {
    console.log("listening on port 80...");
});
