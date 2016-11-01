
var fs = require("fs");
var q = require("q");
var query_manager = require("./query.js");

module.exports = {
    servers: [],

    new: function(base) {
        var me = this;
        base.manager = me;

        // validate server name
        if (base.name == null) {
            throw new Error("10711: each server must have a name.");
        }
        var server_with_same_name = me.servers.find(function(s) { return (s.name == base.name) });
        if (server_with_same_name) {
            throw new Error("10712: server name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10713: server name cannot contain periods (" + base.name + ").");
        }

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
            query_manager.new(base.in.query);
        }

        // validate in/results
        if (base.in.query != null) {
            if (Array.isArray(base.in.results)) {
                base.in.results.forEach(function(r) {
                    result_manager.new(r, base);
                });
            } else {
                throw new Error("10051: service in/query was specified so there must be at least one result (" + base.name + ").");
            }
        }

        // init properties
        base.polled = null;
        base.state = base.in.default;
        base.reportInherits = true;
        base.report = base.in.default;
        base.properties = [];

        // start polling
        var poll = function() {
            try {
                base.in.query.execute(base.in.results).then(function(result) {
                    if (base.polled != result.state) {
                        base.polled = result.state;
                        rule_manager.emit("service-change");
                    }
                    if (base.state != result.state) {
                        base.state = result.state;
                    }
                    console.log(result);
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

        me.services.push(base);
        return base;
    }

}