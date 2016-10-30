
var fs = require("fs");
var q = require("q"); 

module.exports = {
    names: [],

    load: function(files) {
        var me = this;
        var wrapper = q.defer();
        var promises = [];

        files.forEach(function(file) {
            if (!file.startsWith("sample.") && file.endsWith(".rules")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var rules = JSON.parse(contents);
                            rules.forEach(function(rule) {
                                me.new(rule);
                            });
                            deferred.resolve(rules);
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10500: rules config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10501: rules config file could not be read (" + file + ") - " + error + ".");
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

        // validate rule name
        if (base.name == null) {
            throw new Error("10511: each rule must have a name.");
        }
        if (me.names.indexOf(base.name) > -1) {
            throw new Error("10512: rule name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10513: rule name cannot contain periods (" + base.name + ").");
        }
        me.names.push(base.name);

        // validate if
        if (base.if == null) {
            throw new Error("10521: rule must include an if clause (" + base.name + ").");
        }

        // validate then or else
        if (!base.then && !base.else) {
            throw new Error("10531: rule must include a then and/or else property (" + base.name + ").")
        }

        // add the evaluate method
        base.evaluate = function(conditions, services) {

            // resolve the formula
            var formula = base.if;
            console.log("formula is: " + formula);
            conditions.forEach(function(condition) {
                if (condition.evaluate(services)) {
                    formula = formula.replace(condition.name, "true");
                } else {
                    formula = formula.replace(condition.name, "false");
                }
            });
            console.log("eval as: " + formula);

        }

    },

    evaluate: function(rules, conditions, services) {

        rules.forEach(function(rule) {
            rule.evaluate(conditions, services);
        });

        services.forEach(function(service) {
            console.log(service.name + " s:" + service.state + " r:" + service.report);
        });

    }

}