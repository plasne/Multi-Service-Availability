var express = require("express");
var app = express();

app.use(express.static("files"));

app.get("/", function(req, res) {
  res.redirect("/default.htm");
});

app.listen(80, function() {
  console.log("listening on port 80...");
});
