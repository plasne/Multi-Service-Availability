
var fs = require("fs");
var q = require("q");
var query = require("./query.js");
var result = require("./result.js");

module.exports = {
    names: [],

    load: function(files) {
        var promises = [];

        files.forEach(function(file) {
            if (!file.startsWith("sample.") && file.endsWith(".services")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            deferred.resolve(JSON.parse(contents));
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10001: services config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10002: services config file could not be read (" + file + ") - " + error + ".");
                    }
                });
            }
        });

        return q.all(promises);
    },

    new: function(base) {

        // validate service name
        if (base.name == null) {
            throw new Error("10011: service must have a name.");
        }
        if (this.names.indexOf(base.name) > -1) {
            throw new Error("10012: service name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10013: service name cannot contain periods (" + base.name + ").");
        }
        this.names.push(base.name);

        // validate priority
        if (isNaN(base.priority)) {
            throw new Error("10021: service priority must be a number (" + base.priority + ").");
        }

        // validate in
        if (base.in == null) {
            throw new Error("10031: service must have an in node for probing health.");
        }

        // validate in/default
        if (base.in.default == null) {
            base.in.default = "down";
        }

        // validate in/poll
        if (base.in.poll == null) {
            base.in.poll = 30000;
        } else {
            var int = parseInt(base.in.poll);
            if (int !== NaN) {
                base.in.poll = int;
            } else {
                throw new Error("10041: service in/ping must be an integer (" + base.in.poll + ").");
            }
        }

        // validate in/query
        if (base.in.query != null) {
            query.new(base.in.query);
        }

        // validate in/results
        if (base.in.query != null) {
            if (Array.isArray(base.in.results)) {
                base.in.results.forEach(function(r) {
                    result.new(r);
                });
            } else {
                throw new Error("10051: service in/query was specified so there must be at least one result.");
            }
        }

        // start polling
        var poll = function() {
            console.log("poll");
            try {
                base.in.query.execute(base.in.results).then(function(r) {
                    console.log(r);
                }, function(o) {
                    console.log("xxxxx: " + o.error);
                });
            } catch (ex) {
                console.log("xxxxx: " + ex.message);
            }
            setTimeout(poll, base.in.poll);
        }
        if (base.in.query != null) {
            console.log("start poll " + base.in.poll);
            setTimeout(poll, base.in.poll);
        }

        return base;
    }

}