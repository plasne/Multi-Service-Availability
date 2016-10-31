
const fs = require("fs");
const q = require("q");
const action_manager = require("./action.js");
const emitter = require("events");

module.exports = {
    emitter: new emitter(),
    next: null,
    names: [],

    load: function(files) {
        var me = this;
        var wrapper = q.defer();
        var promises = [];

        files.forEach(function(file) {
            if (file.endsWith(".rules")) {
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
        base.manager = me;

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

        // validate then and/or else
        if (!base.then && !base.else) {
            throw new Error("10531: rule must include a then and/or else property (" + base.name + ").")
        }
        if (base.then) {
            if (Array.isArray(base.then)) {
                base.then.forEach(function(a) {
                    action_manager.new(a, base);
                });
            } else {
                var a = action_manager.new(base.then, base);
                base.then = [ a ];
            }
        }
        if (base.else) {
            if (Array.isArray(base.else)) {
                base.else.forEach(function(a) {
                    action_manager.new(a, base);
                });
            } else {
                var a = action_manager.new(base.else, base);
                base.else = [ a ];
            }
        }

        // add the evaluate method
        base.evaluate = function(conditions, services) {

            // resolve the formula
            var formula = base.if;
            console.log("*************** formula is: " + formula);
            conditions.forEach(function(condition) {
                if (formula.indexOf(condition.name) > -1) {
                    if (condition.evaluate(services) === true) {
                        formula = formula.replaceAll(condition.name, "true");
                    } else {
                        formula = formula.replaceAll(condition.name, "false");
                    }
                }
            });
            formula = formula.replaceAll(" AND ", " && ");
            formula = formula.replaceAll(" OR ", " || ");

            // evaluate the formula and process then or else
            console.log("*************** eval as: " + formula);
            try {
                var value = eval(formula);
                if (value === true) {
                    if (base.then) {
                        base.then.forEach(function(a) {
                            a.execute(services);
                        });
                    }
                } else {
                    if (base.else) {
                        base.else.forEach(function(a) {
                            a.execute(services);
                        });
                    }
                }
            } catch (ex) {
                throw new Error("10541: the rule (" + base.name + ") formula (" + base.if + ") could not be fully evaluated (" + formula + ").");
            }

        }

    },

    start: function(rules, conditions, services) {
        const me = this;
        me.emit = me.emitter.emit;
        me.on = me.emitter.on;

        // schedule the processing of rules (100ms from the latest change)
        me.on("service-change", function() {
            if (me.next) {
                clearTimeout(me.next);
                console.log("service-change: clear");
            }
            console.log("service-change: queue");
            me.next = setTimeout(function() {
                clearTimeout(me.next);
                me.evaluate(rules, conditions, services);
            }, 100);
        });

    },

    evaluate: function(rules, conditions, services) {

        // report should start with inheriting
        services.forEach(function(service) {
            service.reportInherits = true;
        });

        // evaluate the rule chain
        rules.forEach(function(rule) {
            rule.evaluate(conditions, services);
        });

        // copy state to report
        services.forEach(function(service) {
            if (service.reportInherits) {
                service.report = service.state;
            }
        });

        // report
        services.forEach(function(service) {
            console.log(service.name + " s:" + service.state + " r:" + service.report);
        });

    }
    

}