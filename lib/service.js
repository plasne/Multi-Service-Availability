
const verror = require("verror");
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
        var count = 0;
        files.forEach(function(file) {
            if (file.endsWith(".services")) {
                const deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var services = JSON.parse(contents);
                            services.forEach(function(service) {
                                me.new(service);
                            });
                            deferred.resolve();
                            console.info("loaded %s (%d files).", file, count);
                        } catch (ex) {
                            throw new verror(ex, "10801: services config file (%s) was not valid.", file);
                        }
                    } else {
                        throw new verror(error, "10802: services config file (%s) could not be read.", file);
                    }
                });
                count++;
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
            throw new verror("10811: each service must have a name.");
        }
        const service_with_same_name = me.services.find(function(s) { return (s.name == base.name) });
        if (service_with_same_name) {
            throw new verror("10812: service name (%s) must be unique.", base.name);
        }
        if (base.name.indexOf(".") > -1) {
            throw new verror("10813: service name (%s) cannot contain periods.", base.name);
        }

        // validate priority
        if (base.priority == null) {
            base.priority = 0;
        } else {
            var int = parseInt(base.priority);
            if (int !== NaN) {
                base.priority = int;
            } else {
                throw new verror("10821: service (%s) priority must be a number (%s).", base.name, base.priority);
            }
        }

        // validate in
        if (base.in == null) {
            throw new verror("10831: service (%s) must have an in node for probing health.", base.name);
        }

        // validate in/poll
        if (base.in.poll == null) {
            base.in.poll = 30000;
        } else {
            var int = parseInt(base.in.poll);
            if (int !== NaN) {
                base.in.poll = int;
            } else {
                throw new verror("10841: service (%s) in/ping must be an integer (%s).", base.name, base.in.poll);
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
                    result_manager.new(r, "in");
                });
            } else {
                throw new verror("10851: service (%s) in/query was specified so there must be at least one result.", base.name);
            }
        }

        // validate out
        if (base.out != null) {
            
            // validate out/results
            if (base.out.results != null) {
                if (Array.isArray(base.out.results)) {
                    base.out.results.forEach(function(r) {
                        result_manager.new(r, "out");
                    });
                } else {
                    throw new verror("10852: service (%s) out/query was specified so there must be at least one result.", base.name);
                }
            }

        }

        // init properties
        base.clear = function() {
            base.pollcount = 0;
            base["polled-actual"] = null;
            base.polled = null;
            base.state = null;
            base.reportInherits = true;
            base.report = null;
            base.last = null;
            base.properties = [];
        }
        base.clear();

        me.services.push(base);
        return base;
    },

    inventory: function(options) {
        options = options || {};
        const list = [];
        const me = this;

        me.services.forEach(function(service) {
            var include = false;
            if (service.isLocal && (options.local == null || options.local === true)) include = true;
            if (service.isRemote && (options.remote == null || options.remote === true)) include = true;
            if (include) {
                var entry = {};
                if (options.name == null || options.name === true) entry.name = service.name;
                if (options.fqn == null || options.fqn === true) entry.fqn = service.fqn;
                if (options.state == null || options.state === true) entry.state = service.state;
                if (options.report == null || options.report === true) entry.report = service.report;
                if (options.properties == null || options.properties === true) entry.properties = service.properties;
                list.push(entry);
            }
        });

        return list;
    },

    update: function(context, packet) {
        const me = this;

        packet.forEach(function(msg) {
            const service = me.services.find(function(s) { return s.isLocal && s.name == msg.name });
            if (service) {
                service.clear();
                service.report = msg.report;
            }
        });

    },

    start: function(context) {
        const me = this;

        // start each service
        me.services.forEach(function(service) {

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
                    if (context.region.instance.isMaster) {
                        try {
                            service.in.query.execute(service.in.results).then(function(result) {
                                console.log("service (%s) health probe result: %s.", service.name, JSON.stringify(result));
                                
                                // only do something if there is a change
                                const state = result.states[0];
                                if (service.polled != state) {
                                    const is_init = (service["polled-actual"] == null); 

                                    // increment the counter for the number of times this poll has happened in a row
                                    if (service["polled-actual"] == state) {
                                        service.pollcount++;
                                    } else {
                                        service.pollcount = 1;
                                        service["polled-actual"] = state;
                                    }

                                    // apply the changes if possible
                                    if (is_init) {
                                        console.log("service (%s) polled as (%s) was immediately changed from (%s) because the service is initializing.", service.name, service["polled-actual"], service.polled);
                                        service.polled = state;
                                        context.events.emit("local.service.polled:changed");
                                    } else if (service.pollcount >= result["apply-after"]) {
                                        console.log("service (%s) polled as (%s) was changed from (%s) because the last %d polls agreed.", service.name, service["polled-actual"], service.polled, service.pollcount);
                                        service.polled = state;
                                        context.events.emit("local.service.polled:changed");
                                    } else {
                                        console.log("service (%s) polled as (%s) %d times out of %d required to change from (%s).", service.name, service["polled-actual"], service.pollcount, result["apply-after"], service.polled);
                                    }
                                }

                            }, function(o) {
                                console.log("service (%s) health probe result: %s", service.name, JSON.stringify(o.error));
                            }).done();
                        } catch (ex) {
                            // this should never happen, but the catch is here just in case it does
                            throw new verror(ex, "10861: unhandled exception on service.in.query (%s).", service.name);
                        }
                    }
                    setTimeout(poll, service.in.poll);
                }
                setTimeout(poll, service.in.poll);
            }

            // start accepting updates
            context.events.on("remote.instance:sync", function(packet) {
                me.update(context, packet);
            });

        });

    },

    validate: function(context) {
        const me = this;

        // set the fqn
        me.services.forEach(function(service) {
            service.fqn = context.region.name + "." + service.name;
        });

    }

}