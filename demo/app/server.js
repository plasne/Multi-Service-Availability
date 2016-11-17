var express = require("express");
var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/name", function(req, res) {
  res.send({ name: "Peter" });
});

// msa health endpoint
app.get("/health", function(req, res) {
    // check anything that needs to be checked 
    res.status(200).end();
});

// load balancer health endpoint
app.get("/report", function(req, res) {
    request({
        uri: "http://msa/report/app",
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
