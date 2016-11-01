
const fs = require("fs");
const q = require("q");
const instance_manager = require("./instance.js");
const query_manager = require("./query.js");

module.exports = {
    local: null,
    regions: [],

    load: function(files) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        // load
        files.forEach(function(file) {
            if (file.endsWith(".regions")) {
                const deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            const regions = JSON.parse(contents);
                            regions.forEach(function(region) {
                                me.new(region);
                            });
                            deferred.resolve();
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10300: regions config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10301: regions config file could not be read (" + file + ") - " + error + ".");
                    }
                });
            }
        });

        // consolidate
        q.all(promises).then(function(outer) {
            wrapper.resolve(me.regions);
        });

        return wrapper.promise;
    },

    new: function(base) {
        const me = this;

        // determine whether local or remote
        base.isRemote = (base.query != null);
        base.isLocal = !base.isRemote;

        // validate region name
        if (base.name == null) {
            throw new Error("10311: each region must have a name.");
        }
        const region_with_same_name = me.regions.find(function(r) { return (r.name == base.name) });
        if (region_with_same_name) {
            throw new Error("10312: region name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10313: region name cannot contain periods (" + base.name + ").");
        }

        // validate local properties
        if (base.isLocal) {
            me.local = base; 

            // validate priority
            if (base.priority != null) {
                var int = parseInt(base.priority);
                if (int !== NaN) {
                    base.priority = int;
                } else {
                    throw new Error("10321: region priority must be a valid integer (" + base.name + ", " + base.priority + ").");
                }
            } else {
                base.priority = 0;
            }

            // validate default-poll
            if (base["default-poll"] != null) {
                var int = parseInt(base["default-poll"]);
                if (int !== NaN) {
                    base["default-poll"] = int;
                } else {
                    throw new Error("10331: region default-poll time must be a valid integer (" + base.name + ", " + base["default-poll"] + ").");
                }
            } else {
                base["default-poll"] = 30000;
            }

            // validate process-after-idle
            if (base["process-after-idle"] != null) {
                var int = parseInt(base["process-after-idle"]);
                if (int !== NaN) {
                    base["process-after-idle"] = int;
                } else {
                    throw new Error("10341: region process-after-idle time must be a valid integer (" + base.name + ", " + base["process-after-idle"] + ").");
                }
            } else {
                base["process-after-idle"] = 5000;
            }

            // validate poll
            if (base.poll) {
                throw new Error("10351: you may not specify a poll time for a local region (" + base.name + ").");
            }

            // validate instances
            if (Array.isArray(base.instances)) {
                base.instances.forEach(function(instance) {
                    instance_manager.new(instance);
                });
            } else {
                base.instances = [];
            }
            if (base.instances.length < 1) {
                // warn about not running in HA mode
            }

        }

        // validate remote properties
        if (base.isRemote) {

            // validate priority
            if (base.priority) {
                throw new Error("10322: you may not specify a priority for a remote region (" + base.name + ")");
            }

            // validate default-poll
            if (base["default-poll"]) {
                throw new Error("10332: you may not specify a default-poll time for a remote region (" + base.name + ").");
            }

            // validate process-after-idle
            if (base["process-after-idle"]) {
                throw new Error("10342: you may not specify a process-after-idle time for a remote region (" + base.name + ").");
            }

            // validate poll
            if (base.poll != null) {
                var int = parseInt(base.poll);
                if (int !== NaN) {
                    base.poll = int;
                } else {
                    throw new Error("10352: region poll time must be a valid integer ("+ base.name + ", " + base.poll + ").");
                }
            } else {
                base.poll = 5000;
            }

            // validate query
            if (base.query) {
                query_manager.new(base.query);
                if (!base.query.uri.endsWith("/current")) {
                    base.query.uri += (base.query.uri.endsWith("/")) ? "current" : "/current";
                }
            } else {
                throw new Error("10361: remote regions must have a query defined (" + base.name + ").");
            }

        }

        me.regions.push(base);
        return base;
    },

    validate: function() {
        const me = this;

        // ensure there is exactly 1 local region
        var count = 0;
        me.regions.forEach(function(region) {
            if (region.isLocal) count++;
        });
        if (count != 1) {
            throw new Error("10371: there must be exactly one local region specified across all loaded region files.");
        }

    },

    start: function(context) {
        const me = this;

        // start each region
        me.regions.forEach(function(region) {
            if (region.isRemote) {

                // start polling each remote region
                const poll = function() {
                    try {
                        region.query.execute().then(function(result) {
                            const remote = JSON.parse(result.body);

                            // raise a queried event for each service
                            remote.services.forEach(function(service) {
                                context.events.emit("remote.service:queried", {
                                    fqn: remote.region + "." + service.name,
                                    isLocal: false,
                                    isRemote: true,
                                    state: service.state,
                                    report: service.report,
                                    properties: service.properties
                                });
                            });

                        }, function(result) {
                            console.log(result);
                        });
                    } catch (ex) {
                        console.log("10762: " + ex.message);
                    }
                    setTimeout(poll, region.poll);
                }
                setTimeout(poll, region.poll);

            }
        });

    }


}