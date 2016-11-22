
const verror = require("verror");
const fs = require("fs");
const q = require("q");
const query_manager = require("./query.js");

module.exports = {

    new: function(base, region) {
        const me = this;
        base.manager = me;

        // validate server name
        if (base.name == null) {
            throw new verror("10711: each instance must have a name.");
        }
        const instance_with_same_name = region.instances.find(function(i) { return (i != base && i.name == base.name) });
        if (instance_with_same_name) {
            throw new verror("10712: instance name (%s) must be unique.", base.name);
        }
        //if (base.name.indexOf(".") > -1) {
            //throw new verror("10713: instance name (%s) cannot contain periods.", base.name);
        //}

        // validate fqdn
        if (base.fqdn == null) {
            throw new verror("10721: instance (%s) must specify an fqdn (fully-qualified domain name).", base.name);
        }

        // validate port
        if (base.port == null) {
            base.port = 80;
        } else {
            var int = parseInt(base.port);
            if (int !== NaN && int > 0 && int < 65535) {
                base.port = int;
            } else {
                throw new verror("10731: instance (%s) port must be a number (&s) between 1 and 65535.", base.name, base.port);
            }
        }

        // add election properties
        base.isMaster = true;
        base.masterSince = Date.now();
        base.isConnected = false;

        // create appropriate queries
        const rejectUnauthorized = !(global.msa_settings.certificate_authority == "self-signed");
        base.elect = query_manager.new({
            method: "POST",
            uri: global.msa_settings.protocol + "://" + base.fqdn + ":" + base.port + "/elect",
            timeout: 10000,
            json: true,
            headers: { },
            rejectUnauthorized: rejectUnauthorized
        });
        base.sync = query_manager.new({
            method: "POST",
            uri: global.msa_settings.protocol + "://" + base.fqdn + ":" + base.port + "/sync",
            timeout: 10000,
            json: true,
            headers: { },
            rejectUnauthorized: rejectUnauthorized
        });
        base.query = query_manager.new({
            method: "GET",
            uri: global.msa_settings.protocol + "://" + base.fqdn + ":" + base.port + "/query",
            timeout: 10000,
            json: true,
            headers: { },
            rejectUnauthorized: rejectUnauthorized
        });
        base.all = query_manager.new({
            method: "GET",
            uri: global.msa_settings.protocol + "://" + base.fqdn + ":" + base.port + "/all",
            timeout: 10000,
            json: true,
            rejectUnauthorized: rejectUnauthorized
        });

        return base;
    }

}