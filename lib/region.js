
var fs = require("fs");
var q = require("q"); 

module.exports = {
    names: [],

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
        me.isRemote = base.query;
        me.isLocal = !me.isRemote;

        // validate region name
        if (base.name == null) {
            throw new Error("10311: each region must have a name.");
        }

        if (me.names.indexOf(base.name) > -1) {
            throw new Error("10312: region name must be unique (" + base.name + ").");
        }

        if (base.name.indexOf(".") > -1) {
            throw new Error("10313: region name cannot contain periods (" + base.name + ").");
        }
        me.names.push(base.name);

        // validate priority
        if (base.priority != null) {
            if (me.isRemote) {
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
            if (me.isRemote) {
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

        // validate process
        if (base.process != null) {
            if (me.isRemote) {
                throw new Error("10331: you may not specify a process time for a remote region (" + base.name + ").");
            } else {
                var int = parseInt(base.process);
                if (int !== NaN) {
                    base.process = int;
                } else {
                    throw new Error("10332: region process time must be a valid integer (" + base.name + ", " + base.process + ").");
                }
            }
        } else {
            base.process = 5000;
        }

        // validate poll
        if (base.poll != null) {
            if (me.isLocal) {
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

        return base;
    }

}