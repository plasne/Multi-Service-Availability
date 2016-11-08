var express = require("express");
var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/name", function(req, res) {
  res.send({ name: "East" });
});

app.listen(80, function() {
  console.log("listening on port 80...");
});
