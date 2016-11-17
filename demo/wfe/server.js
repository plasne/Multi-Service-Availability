
var express = require("express");
var request = require("request");
var app = express();

app.use(express.static("files"));

app.get("/", function(req, res) {
    res.redirect("/default.htm");
});

// msa health endpoint
app.get("/health", function(req, res) {
    // check anything that needs to be checked 
    res.status(200).end();
});

// load balancer health endpoint
app.get("/report", function(req, res) {
    request({
        uri: "http://msa/report/wfe",
        json: true
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
