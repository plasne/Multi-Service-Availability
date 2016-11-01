
var fs = require("fs");
var q = require("q"); 

module.exports = {
    regions: [],

    load: function(files) {
        var me = this;
        var wrapper = q.defer();
        var promises = [];

        // load
        files.forEach(function(file) {
            if (file.endsWith(".regions")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var regions = JSON.parse(contents);
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

        // determine whether local or remote
        base.isRemote = base.query;
        base.isLocal = !me.isRemote;

        // validate region name
        if (base.name == null) {
            throw new Error("10311: each region must have a name.");
        }
        var region_with_same_name = me.regions.find(function(r) { return (r.name == base.name) });
        if (region_with_same_name) {
            throw new Error("10312: region name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10313: region name cannot contain periods (" + base.name + ").");
        }

        // validate priority
        if (base.priority != null) {
            if (base.isRemote) {
                throw new Error("10314: you may not specify a priority for a remote region.");
            } else {
                var int = parseInt(base.priority);
                if (int !== NaN) {
                    base.priority = int;
                } else {
                    throw new Error("10315: region priority must be a valid integer (" + base.name + ", " + base.priority + ").");
                }
            }
        } else {
            base.priority = 0;
        }

        // validate default-poll
        if (base["default-poll"] != null) {
            if (base.isRemote) {
                throw new Error("10321: you may not specify a default-poll time for a remote region (" + base.name + ").");
            } else {
                var int = parseInt(base["default-poll"]);
                if (int !== NaN) {
                    base["default-poll"] = int;
                } else {
                    throw new Error("10322: region default-poll time must be a valid integer (" + base.name + ", " + base["default-poll"] + ").");
                }
            }
        } else {
            base["default-poll"] = 30000;
        }

        // validate process-after-idle
        if (base["process-after-idle"] != null) {
            if (base.isRemote) {
                throw new Error("10331: you may not specify a process-after-idle time for a remote region (" + base.name + ").");
            } else {
                var int = parseInt(base["process-after-idle"]);
                if (int !== NaN) {
                    base["process-after-idle"] = int;
                } else {
                    throw new Error("10332: region process-after-idle time must be a valid integer (" + base.name + ", " + base["process-after-idle"] + ").");
                }
            }
        } else {
            base.process = 5000;
        }

        // validate poll
        if (base.poll != null) {
            if (base.isLocal) {
                throw new Error("10341: you may not specify a poll time for a local region (" + base.name + ").");
            } else {
                var int = parseInt(base.poll);
                if (int !== NaN) {
                    base.poll = int;
                } else {
                    throw new Error("10342: region poll time must be a valid integer ("+ base.name + ", " + base.poll + ").");
                }
            }
        }

        // validate query

        me.regions.push(base);
        return base;
    },

    validate: function() {
        var me = this;

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