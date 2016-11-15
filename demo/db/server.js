
// includes
const express = require("express");
const verror = require("verror");
const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const tds_connection = require("tedious").Connection;
const tds_request = require("tedious").Request;
const tds_types = require("tedious").TYPES;

// globals
const app = express();
var isConnected = false;
var role = "UNKNOWN";

// CORS
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// health probe endpoint
app.get("/health", function(req, res) {
    if (isConnected && role == "PRIMARY") {
        res.send([ "read", "write" ]);
    } else if (isConnected && role == "SECONDARY") {
        res.send([ "read" ]);
    } else {
        res.status(503);
    }
});

// start listening
app.listen(80, function() {
    console.log("listening on port 80...");
});

// open a connection to the database
if (!argv.config) throw new verror("10000: you must specify a config file.");
fs.readFile("./config/" + argv.config + ".settings", function(error, contents) {
    if (!error) {
        try {
            const connection_options = JSON.parse(contents);
            var database = connection_options.options.database;
            connection_options.options.database = "master";

            // on connect start the query process
            var connection_health = new tds_connection(connection_options);
            connection_health.on("connect", function(err) {
                if (!err) {

                    // get the server's current role
                    const get_health = function() {
                        try {
                            var request = new tds_request("SELECT role_desc FROM [sys].geo_replication_links;", function(err, rowCount) {
                                if (err) console.error(err, "10002: could not get health.");
                            });
                            request.on("row", function(columns) {
                                isConnected = true;
                                role = columns[0].value;
                                console.log("role determined to be: %s.", role);
                            });
                            connection_health.execSql(request);
                        } catch (ex) {
                            isConnected = false;
                            console.error(new verror(ex, "10003: could not get health.").message);
                        }
                        setTimeout(get_health, 5000);
                    }
                    setTimeout(get_health, 50);

                } else {
                    console.error(new verror(err, "10005: cannot connect to the database.").message);
                }
            });

            // allow for failover
            app.get("/failover", function(req, res) {
                try {
                    var connection_failover = new tds_connection(connection_options);
                    connection_failover.on("connect", function(err) {
                        // note that this query might complete before the database failover; this will result in an error should the db failover be attempted again while in progress 
                        var cmd = "DECLARE @role VARCHAR(50); SELECT @role = role_desc FROM [sys].geo_replication_links; IF (@role = 'SECONDARY') ALTER DATABASE [" + database + "] FAILOVER;";
                        console.log(cmd);
                        var request = new tds_request(cmd, function(err, rowCount) {
                            if (!err) {
                                res.status(200).send("failed over successfully.");
                            } else {
                                console.error(new verror(err, "10006: could not failover.").message);
                                res.status(500).send("could not failover.");
                            }
                        });
                        connection_failover.execSql(request);
                    });
                } catch(ex) {
                    console.error(new verror(ex, "10007: could not failover.").message);
                    res.status(500).send("could not failover.");
                }
            });

            console.info("loaded %s.settings.", argv.config);
        } catch (ex) {
            throw new verror(ex, "10006: cannot load config file (%s).", argv.config);
        }
    } else {
        throw new verror(error, "10007: cannot load config file (%s).", argv.config);
    }
});

