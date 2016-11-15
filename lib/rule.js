
const verror = require("verror");
const fs = require("fs");
const q = require("q");
const action_manager = require("./action.js");

module.exports = {
    next: null,
    rules: [],

    load: function(files) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        var count = 0;
        files.forEach(function(file) {
            if (file.endsWith(".rules")) {
                const deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            var rules = JSON.parse(contents);
                            rules.forEach(function(rule) {
                                me.new(rule);
                            });
                            deferred.resolve();
                            console.info("loaded %s (%d files).", file, count);
                        } catch (ex) {
                            throw new verror(ex, "10500: rules config file (%s) was not valid.", file);
                        }
                    } else {
                        throw new verror(error, "10501: rules config file (%s) could not be read.", file);
                    }
                });
                count++;
            }
        });

        // consolidate
        q.all(promises).then(function(outer) {
            wrapper.resolve(me.rules);
        });

        return wrapper.promise;
    },

    new: function(base) {
        const me = this;
        base.manager = me;

        // validate rule name
        if (base.name == null) {
            throw new verror("10511: each rule must have a name.");
        }
        const rule_with_same_name = me.rules.find(function(r) { return (r.name == base.name) });
        if (rule_with_same_name) {
            throw new verror("10512: rule name (%s) must be unique.", base.name);
        }
        if (base.name.indexOf(".") > -1) {
            throw new verror("10513: rule name (%s) cannot contain periods.", base.name);
        }

        // validate if
        if (base.if == null) {
            throw new verror("10521: rule (%s) must include an if clause.", base.name);
        }

        // validate then and/or else
        if (!base.then && !base.else) {
            throw new verror("10531: rule (%s) must include a then and/or else property.", base.name);
        }
        if (base.then) {
            if (Array.isArray(base.then)) {
                base.then.forEach(function(a) {
                    action_manager.new(a, me, "then");
                });
            } else {
                var a = action_manager.new(base.then, base, "then");
                base.then = [ a ];
            }
        }
        if (base.else) {
            if (Array.isArray(base.else)) {
                base.else.forEach(function(a) {
                    action_manager.new(a, me, "else");
                });
            } else {
                var a = action_manager.new(base.else, base, "else");
                base.else = [ a ];
            }
        }

        // add the preprocess method
        base.preprocess = function(context) {
            if (base.then) {
                base.then.forEach(function(action) {
                    if (typeof action.preprocess === "function") action.preprocess();
                });
            }
            if (base.else) {
                base.else.forEach(function(action) {
                    if (typeof action.preprocess === "function") action.preprocess();
                });
            }
        }

        // add the postprocess method
        base.postprocess = function(context) {
            if (base.then) {
                base.then.forEach(function(action) {
                    if (typeof action.postprocess === "function") action.postprocess();
                });
            }
            if (base.else) {
                base.else.forEach(function(action) {
                    if (typeof action.postprocess === "function") action.postprocess();
                });
            }
        }

        // add the resolve method that turns an if clause into something that can be processed
        base.resolve = function(context, force) {
            var formula = base.if;

            // sort longest to shortest
            const longest_to_shortest = context.conditions.sort(function(a, b) {
                return b.name.length - a.name.length;
            });

            // replace with conditions
            longest_to_shortest.forEach(function(condition) {
                if (formula.indexOf(condition.name) > -1) {
                    if (force !== true && force !== false) { 
                        if (condition.evaluate(context) === true) {
                            formula = formula.replaceAll(condition.name, "true");
                        } else {
                            formula = formula.replaceAll(condition.name, "false");
                        }
                    } else {
                        formula = formula.replaceAll(condition.name, force.toString());
                    }
                }
            });

            // replace AND/OR
            formula = formula.replaceAll(" AND ", " && ");
            formula = formula.replaceAll(" OR ", " || ");

            return formula;
        }

        // add the evaluate method
        base.evaluate = function(context) {

            // evaluate the formula and process then or else
            if (global.msa_settings.loglevel >= 4) console.log("rule (%s) will attempt to resolve the if clause (%s).", base.name, base.if);
            var formula = base.resolve(context);
            if (global.msa_settings.loglevel >= 4) console.log("rule (%s) resolved the if clause (%s).", base.name, formula);
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
                // 10551 should have detected this at startup, but if it somehow happens, let the rule take no action
                const e = new verror(ex, "10541: the rule (%s) formula (%s) could not be fully evaluated (%s).", base.name, base.if, formula);
                console.error(e.message);
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
                    console.log("service-change: clear, queue %s.", wait);
                } else {
                    console.log("service-change: queue %s.", wait);
                }
                me.next = setTimeout(function() {
                    clearTimeout(me.next);
                    me.evaluate(context);
                }, wait);
            }
        }
        context.events.on("local.service.polled:changed", change);
        context.events.on("local.service.properties:changed", change);
        context.events.on("local.service.pause:expired", change);
        context.events.on("remote.service.priority:changed", change);
        context.events.on("remote.service.state:changed", change);
        context.events.on("remote.service.report:changed", change);
        context.events.on("remote.service.properties:changed", change);
        context.events.on("remote.service:new", change);
        context.events.on("remote.service:cleared", change);

    },

    evaluate: function(context) {

        // report should start with inheriting
        context.services.forEach(function(service) {
            if (service.isLocal) {
                service.reportInherits = true;
                service.state = service.polled;
                service.last = service.report;
            }
        });

        // pre-process
        context.rules.forEach(function(rule) {
            rule.preprocess(context);
        });

        // evaluate the rule chain
        context.rules.forEach(function(rule) {
            rule.evaluate(context);
        });

        // copy state to report
        const services_with_new_report_value = [];
        context.services.forEach(function(service) {
            if (service.isLocal) {
                if (service.reportInherits) {
                    service.report = service.state;
                }
                if (service.report != service.last) {
                    // will fire other events
                    services_with_new_report_value.push({
                        name: service.name,
                        report: service.report
                    });
                }
            }
        });

        // sync
        if (services_with_new_report_value.length > 0) {
            context.events.emit("local.instance:sync", services_with_new_report_value);
        }

        // post-process
        context.rules.forEach(function(rule) {
            rule.postprocess(context);
        });

        // report
        context.services.forEach(function(service) {
            console.info("after evaluating all rules: (%s, state: %s, report %s).", service.fqn, service.state, service.report);
        });

    },

    validate: function(context) {
        const me = this;

        // look at each rule
        me.rules.forEach(function(rule) {

            // validate if clause
            const formula = rule.resolve(context, true); // forced to true to make sure comparisons can be evaluated
            try {
                var value = eval(formula);
                if (global.msa_settings.loglevel >= 4) console.log("the rule (%s) formula (%s) was successfully evaluated (%s) as (%s).", rule.name, rule.if, formula, value);
            } catch (ex) {
                throw new verror(ex, "10551: the rule (%s) formula (%s) could not be fully evaluated (%s).", rule.name, rule.if, formula);
            }

            // validate then clause
            if (rule.then) {
                rule.then.forEach(function(action) {
                    action.validate(context);
                });
            }

            // validate else clause
            if (rule.else) {
                rule.else.forEach(function(action) {
                    action.validate(context);
                });
            }

        });

    }
    
}