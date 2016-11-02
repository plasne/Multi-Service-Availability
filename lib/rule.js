
const fs = require("fs");
const q = require("q");
const action_manager = require("./action.js");

module.exports = {
    next: null,
    rules: [],

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
                            deferred.resolve();
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
            wrapper.resolve(me.rules);
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
        var rule_with_same_name = me.rules.find(function(r) { return (r.name == base.name) });
        if (rule_with_same_name) {
            throw new Error("10512: rule name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10513: rule name cannot contain periods (" + base.name + ").");
        }

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
                    action_manager.new(a);
                });
            } else {
                var a = action_manager.new(base.then);
                base.then = [ a ];
            }
        }
        if (base.else) {
            if (Array.isArray(base.else)) {
                base.else.forEach(function(a) {
                    action_manager.new(a);
                });
            } else {
                var a = action_manager.new(base.else);
                base.else = [ a ];
            }
        }

        // add the evaluate method
        base.evaluate = function(context) {

            // resolve the formula
            var formula = base.if;
            context.conditions.forEach(function(condition) {
                if (formula.indexOf(condition.name) > -1) {
                    if (condition.evaluate(context) === true) {
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
                        base.then.forEach(function(action) {
                            action.execute(context);
                        });
                    }
                } else {
                    if (base.else) {
                        base.else.forEach(function(action) {
                            action.execute(context);
                        });
                    }
                }
            } catch (ex) {
                throw new Error("10541: the rule (" + base.name + ") formula (" + base.if + ") could not be fully evaluated (" + formula + ").");
            }

        }

        me.rules.push(base);
        return base;
    },

    start: function(context) {
        const me = this;

        // schedule the processing of rules (a short while after the latest change)
        const wait = context.region["process-after-idle"];
        const change = function() {
            if (context.region.instance.isMaster) { // rules aren't processed for slave nodes
                if (me.next) {
                    clearTimeout(me.next);
                    console.log("service-change: clear");
                }
                console.log("service-change: queue " + wait);
                me.next = setTimeout(function() {
                    clearTimeout(me.next);
                    me.evaluate(context);
                }, wait);
            }
        }
        context.events.on("local.service.polled:changed", change);
        context.events.on("remote.service.state:changed", change);
        context.events.on("remote.service.report:changed", change);
        context.events.on("remote.service.properties:changed", change);
        context.events.on("remote.service:new", change);

    },

    evaluate: function(context) {

        // report should start with inheriting
        context.services.forEach(function(service) {
            if (service.isLocal) {
                service.reportInherits = true;
                service.state = service.polled;
            }
        });

        // evaluate the rule chain
        context.rules.forEach(function(rule) {
            rule.evaluate(context);
        });

        // copy state to report
        context.services.forEach(function(service) {
            if (service.isLocal && service.reportInherits) {
                service.report = service.state;
            }
        });

        // report
        context.services.forEach(function(service) {
            console.log(service.fqn + " s:" + service.state + " r:" + service.report);
        });

    }
    

}