var express = require("express");
var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/health", function(req, res) {
  res.send([ "read", "write" ]);
});

app.listen(80, function() {
  console.log("listening on port 80...");
});
