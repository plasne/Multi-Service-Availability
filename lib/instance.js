
var fs = require("fs");
var q = require("q");
var query_manager = require("./query.js");

module.exports = {
    instances: [],

    new: function(base, region) {
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

        // validate fqdn
        if (base.fqdn == null) {
            throw new Error("10721: instance (" + base.name + ") must specify an fqdn (fully-qualified domain name).");
        }

        // validate port
        if (base.port == null) {
            base.port = 80;
        } else {
            var int = parseInt(base.port);
            if (int !== NaN && int > 0 && int < 65535) {
                base.port = int;
            } else {
                throw new Error("10731: instance (" + base.name + ") port must be a number (" + base.port + ") between 1 and 65535.");
            }
        }

        // add election properties
        base.isMaster = false;
        base.isConnected = false;

        // create appropriate queries
        base.elect = query_manager.new({
            method: "POST",
            uri: "http://" + base.fqdn + ":" + base.port + "/elect",
            timeout: 10000,
            json: true
        });
        base.sync = query_manager.new({
            method: "POST",
            uri: "http://" + base.fqdn + ":" + base.port + "/sync",
            timeout: 10000,
            json: true
        });
        base.query = query_manager.new({
            method: "GET",
            uri: "http://" + base.fqdn + ":" + base.port + "/query"
        });

        me.instances.push(base);
        return base;
    }

}