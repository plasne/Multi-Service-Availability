
var fs = require("fs");
var q = require("q"); 

module.exports = {

    load: function(files) {
        var promises = [];

        files.forEach(function(file) {
            if (!file.startsWith("sample.") && file.endsWith(".regions")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            deferred.resolve(JSON.parse(contents));
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

        return q.all(promises);
    },

    new: function(base) {
        var me = this;

        // determine whether local or remote
        me.isRemote = base.query;
        me.isLocal = !me.isRemote;

        // validate region name
        if (base.name == null) {
            throw new Error("10311: region must have a name.");
        }
        if (this.names.indexOf(base.name) > -1) {
            throw new Error("10312: region name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10313: region name cannot contain periods (" + base.name + ").");
        }
        this.names.push(base.name);

        // validate priority
        if (base.priority != null) {
            if (me.isRemote) {
                throw new Error("10314: you may not specify a priority for a remote region.");
            } else {
                var int = parseInt(base.priority);
                if (int !== NaN) {
                    base.priority = int;
                } else {
                    throw new Error("10315: region priority must be a valid integer (" + base.priority + ").");
                }
            }
        } else {
            base.priority = 0;
        }

        // validate default-poll
        if (base["default-poll"] != null) {
            if (me.isRemote) {
                throw new Error("10321: you may not specify a default-poll time for a remote region.");
            } else {
                var int = parseInt(base["default-poll"]);
                if (int !== NaN) {
                    base["default-poll"] = int;
                } else {
                    throw new Error("10322: region default-poll time must be a valid integer (" + base["default-poll"] + ").");
                }
            }
        } else {
            base["default-poll"] = 30000;
        }

        // validate process
        if (base.process != null) {
            if (me.isRemote) {
                throw new Error("10331: you may not specify a process time for a remote region.");
            } else {
                var int = parseInt(base.process);
                if (int !== NaN) {
                    base.process = int;
                } else {
                    throw new Error("10332: region process time must be a valid integer (" + base.process + ").");
                }
            }
        } else {
            base.process = 5000;
        }

        // validate poll
        if (base.poll != null) {
            if (me.isLocal) {
                throw new Error("10341: you may not specify a poll time for a local region.");
            } else {
                var int = parseInt(base.poll);
                if (int !== NaN) {
                    base.poll = int;
                } else {
                    throw new Error("10342: region poll time must be a valid integer (" + base.poll + ").");
                }
            }
        }

        // validate query

        return base;
    }

}