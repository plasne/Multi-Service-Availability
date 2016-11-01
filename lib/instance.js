
var fs = require("fs");
var q = require("q");
var query_manager = require("./query.js");

module.exports = {
    instances: [],

    new: function(base) {
        var me = this;
        base.manager = me;

        // validate server name
        if (base.name == null) {
            throw new Error("10711: each instance must have a name.");
        }
        var instance_with_same_name = me.instances.find(function(i) { return (i.name == base.name) });
        if (instance_with_same_name) {
            throw new Error("10712: instance name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10713: instance name cannot contain periods (" + base.name + ").");
        }

        // validate port
        if (base.port == null) {
            base.port = 80;
        } else {
            var int = parseInt(base.port);
            if (int !== NaN && int > 0 && int < 65535) {
                base.port = int;
            } else {
                throw new Error("10721: instance (" + base.name + ") port must be a number (" + base.port + ") between 1 and 65535.");
            }
        }

        // validate query
        if (base.query != null) {
            query_manager.new(base.query);
        }

        // start polling
        /*
        var poll = function() {
            try {
                base.query.execute().then(function(result) {
                    const json = JSON.parse(result.body);
                    console.log("success: " + json);
                }, function(result) {
                    console.log(result);
                });
            } catch (ex) {
                console.log("10762: " + ex.message);
            }
            setTimeout(poll, base.poll);
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
        */

        me.instances.push(base);
        return base;
    }

}