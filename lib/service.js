
var fs = require("fs");
var q = require("q");
var query = require("./query.js");
var result = require("./result.js");

module.exports = {
    names: [],

    load: function(files) {
        var me = this;
        var wrapper = q.defer();
        var promises = [];

        // load
        files.forEach(function(file) {
            if (!file.startsWith("sample.") && file.endsWith(".services")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var services = JSON.parse(contents);
                            services.forEach(function(service) {
                                me.new(service);
                            });
                            deferred.resolve(services);
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

        // consolidate
        q.all(promises).then(function(outer) {
            var consolidated = [];
            outer.forEach(function(inner) {
                inner.forEach(function(element) {
                    consolidated.push(element);
                });
            });
            wrapper.resolve(consolidated);
        });

        return wrapper.promise;
    },

    new: function(base) {
        var me = this;

        // validate service name
        if (base.name == null) {
            throw new Error("10011: each service must have a name.");
        }
        if (me.names.indexOf(base.name) > -1) {
            throw new Error("10012: service name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10013: service name cannot contain periods (" + base.name + ").");
        }
        me.names.push(base.name);

        // validate priority
        if (isNaN(base.priority)) {
            throw new Error("10021: service priority must be a number ("+ base.name + ", " + base.priority + ").");
        }

        // validate in
        if (base.in == null) {
            throw new Error("10031: service must have an in node for probing health (" + base.name + ").");
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
                throw new Error("10041: service in/ping must be an integer ("+ base.name + ", " + base.in.poll + ").");
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
                throw new Error("10051: service in/query was specified so there must be at least one result (" + base.name + ").");
            }
        }

        // init properties
        base.state = base.in.default;
        base.report = base.in.default;
        base.properties = [];

        // start polling
        var poll = function() {
            try {
                base.in.query.execute(base.in.results).then(function(r) {
                    base.state = r.state;
                    console.log(r);
                }, function(o) {
                    console.log("10061: " + o.error);
                });
            } catch (ex) {
                console.log("10062: " + ex.message);
            }
            setTimeout(poll, base.in.poll);
        }
        if (base.in.query != null) {
            base.in.start = function() {
                setTimeout(poll, base.in.poll);
            }
        } else {
            base.in.start = function() {
                // nothing to start
            }
        }

        return base;
    }

}