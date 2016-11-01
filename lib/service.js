
const fs = require("fs");
const q = require("q");
const query_manager = require("./query.js");
const result_manager = require("./result.js");

module.exports = {
    services: [],

    load: function(files) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        // load
        files.forEach(function(file) {
            if (file.endsWith(".services")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var services = JSON.parse(contents);
                            services.forEach(function(service) {
                                me.new(service);
                            });
                            deferred.resolve();
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10801: services config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10802: services config file could not be read (" + file + ") - " + error + ".");
                    }
                });
            }
        });

        // consolidate
        q.all(promises).then(function(outer) {
            wrapper.resolve(me.services);
        });

        return wrapper.promise;
    },

    new: function(base) {
        const me = this;
        base.manager = me;

        // mark as local
        base.isLocal = true;
        base.isRemote = false;

        // validate service name
        if (base.name == null) {
            throw new Error("10811: each service must have a name.");
        }
        const service_with_same_name = me.services.find(function(s) { return (s.name == base.name) });
        if (service_with_same_name) {
            throw new Error("10812: service name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10813: service name cannot contain periods (" + base.name + ").");
        }

        // validate priority
        if (base.priority == null) {
            base.priority = 0;
        } else {
            var int = parseInt(base.priority);
            if (int !== NaN) {
                base.priority = int;
            } else {
                throw new Error("10821: service priority must be a number ("+ base.name + ", " + base.priority + ").");
            }
        }

        // validate in
        if (base.in == null) {
            throw new Error("10831: service must have an in node for probing health (" + base.name + ").");
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
                throw new Error("10841: service in/ping must be an integer ("+ base.name + ", " + base.in.poll + ").");
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
                throw new Error("10851: service in/query was specified so there must be at least one result (" + base.name + ").");
            }
        }

        // init properties
        base.polled = null;
        base.state = base.in.default;
        base.reportInherits = true;
        base.report = base.in.default;
        base.properties = [];

        me.services.push(base);
        return base;
    },

    start: function(context) {
        const me = this;

        // start each service
        me.services.forEach(function(service) {

            // set the fqn
            service.fqn = context.region.name + "." + service.name;

            // listen for queried service info from remote regions
            context.events.on("remote.service:queried", function(msg) {
                const service = me.services.find(function(s) { return s.fqn == msg.fqn });
                if (service) {

                    // update
                    if (service.state != msg.state) {
                        service.state = msg.state;
                        context.events.emit("remote.service.state:changed");
                    }
                    if (service.report != msg.report) {
                        service.report = msg.report;
                        context.events.emit("remote.service.report:changed");
                    }
                    if (!service.properties.isEqual(msg.properties)) {
                        service.properties = msg.properties;
                        context.events.emit("remote.service.properties:changed");
                    }

                } else {

                    // new
                    me.services.push(msg);
                    context.events.emit("remote.service:new");

                }
            });

            // start polling
            if (service.isLocal && service.in.query) {
                const poll = function() {
                    try {
                        service.in.query.execute(service.in.results).then(function(result) {
                            if (service.polled != result.state) {
                                service.polled = result.state;
                                context.events.emit("local.service.polled:changed");
                            }
                            if (service.state != result.state) {
                                service.state = result.state;
                            }
                            //console.log(result);
                        }, function(o) {
                            console.log("10861: " + o.error);
                        });
                    } catch (ex) {
                        console.log("10862: " + ex.message);
                    }
                    setTimeout(poll, service.in.poll);
                }
                setTimeout(poll, service.in.poll);
            }

        });

    }

}