
const fs = require("fs");
const q = require("q");
const instance_manager = require("./instance.js");

module.exports = {
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
                            deferred.resolve(regions);
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
            const consolidated = [];
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
        const me = this;

        // determine whether local or remote
        base.isRemote = base.query;
        base.isLocal = !me.isRemote;

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


        }

        me.regions.push(base);
        return base;
    },

    validate: function() {
        const me = this;

        // ensure there is exactly 1 local region
        var count = 0;
        me.regions.forEach(function(region) {
            if (region.isLocal) {
                me.local = region;
                count++;
            }
        });
        if (count != 1) {
            throw new Error("10362: there must be exactly one local region specified across all loaded region files.");
        }

    }

}