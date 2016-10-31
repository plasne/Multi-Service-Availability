
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
            if (!file.startsWith("sample.") && file.endsWith(".conditions")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var conditions = JSON.parse(contents);
                            conditions.forEach(function(condition) {
                                me.new(condition);
                            });
                            deferred.resolve(conditions);
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10400: conditions config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10401: conditions config file could not be read (" + file + ") - " + error + ".");
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

        // validate condition name
        if (base.name == null) {
            throw new Error("10411: each condition must have a name.");
        }
        if (me.names.indexOf(base.name) > -1) {
            throw new Error("10412: condition name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10413: condition name cannot contain periods (" + base.name + ").");
        }
        me.names.push(base.name);

        // has exactly one eq, all, any, or formula
        var count = 0;
        if (base.eq) count++;
        if (base.all) count++;
        if (base.any) count++;
        if (base.formula) count++;
        if (count != 1) {
            throw new Error("10421: conditions must have exactly one eq, all, any, or formula property (" + base.name + ").");
        }

        // validate eq (service + state, property, report)
        if (base.eq) {
            var eq_count = 0;
            if (base.eq.state) eq_count++;
            if (base.eq.property) eq_count++;
            if (base.eq.report) eq_count++;
            if (!base.eq.service) {
                throw new Error("10431: conditions with eq comparison must specify the service (" + base.name + ").");
            } else if (base.eq.properties) {
                throw new Error("10432: conditions with eq comparison may only specify a single property" + base.name + ".");
            } else if (eq_count == 1) {
                base.evaluate = function(services) {
                    var service = services.find(function(s) { return (s.name == base.eq.service) });
                    if (service) {
                        if (base.eq.state && service.state == base.eq.state) return true;
                        if (base.eq.property && state.properties.indexOf(base.eq.property) > -1) return true;
                        if (base.eq.report && service.report == base.eq.report) return true;
                    } else {
                        throw new Error("10433: condition (" + base.name + ") could not be evaluated because service (" + base.eq.service + ") could not be found.");
                    }
                    return false;
                }
            } else {
                throw new Error("10434: conditions with eq comparison must have exactly one of state, property, or report (" + base.name + ").");
            }
        }

        // validate all (service + properties)
        if (base.all) {
            if (!base.all.service) {
                throw new Error("10441: conditions with all comparison must specify the service (" + base.name + ").");
            } else if (base.all.properties) {
                base.evaluate = function(services) {
                    // stub
                }
            } else {
                throw new Error("10442: conditions with all comparison must specify properties (" + base.name + ").");
            }
        }

        // validate any (service + properties)
        if (base.any) {
            if (!base.any.service) {
                throw new Error("10451: conditions with any comparison must specify the service (" + base.name + ").");
            } else if (base.any.properties) {
                base.evaluate = function(services) {
                    // stub
                }
            } else {
                throw new Error("10452: conditions with any comparison must specify properties (" + base.name + ").");
            }
        }

        // validate formula
        if (base.formula) {
            base.evaluate = function(services) {
                // stub
            }
        }

    }

}