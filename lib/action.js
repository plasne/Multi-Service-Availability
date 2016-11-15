
const verror = require("verror");
const request = require("request");

module.exports = {

    new: function(base, rule, clause) {
        const me = this;

        // determine the type
        if (base.type == null) {
            if (base.service || base.services) {
                base.type = "update";
            } else if (base.pause) {
                base.type = "pause";
            } else if (base.uri) {
                base.type = "webhook";
            } else {
                throw new verror("10601: an action could not be identified as either an update, pause, or webhook.");
            }
        }

        // validate update type 
        if (base.type == "update") {

            // convert to base.services
            if (base.service) {
                if (!Array.isArray(base.services)) base.services = [];
                base.services.push(base.service);
                delete base.service;
            }

            // validate there is at least one change
            var count = 0;
            if (base.state) count++;
            if (base.report) count++;
            if (count > 0) {

                // execute method to update all appropriate services
                base.execute = function(context) {
                    const is_wildcard = base.services.indexOf("*") > -1;
                    context.services.forEach(function(service) {
                        if (service.isLocal && (is_wildcard || base.services.indexOf(service.name) > -1)) {

                            // update as necessary
                            if (base.state && service.state != base.state) {
                                service.state = base.state;
                            }
                            if (base.report) {
                                service.reportInherits = false;
                                if (service.report != base.report) {
                                    service.report = base.report;
                                }
                            }

                        }
                    });
                }

            } else {
                throw new verror("10611: an update action must have at least one state or report node.");
            }

            // add a validation function which can catch bad service references early
            base.validate = function(context) {
                base.services.forEach(function(service_name) {
                    if (service_name == "*") {
                        // this reference is ok
                    } else if (service_name.indexOf(".") > -1) {
                        throw new verror("10621: an update action identified a service by FQN, but only names are allowed.", base.service);
                    } else {
                        const service = context.services.find(function(s) { return (s.isLocal && s.name == service_name) });
                        if (!service) {
                            throw new verror("10622: an update action tried to update a service (%s) but the service could not be found.", service_name);
                        }
                    }
                });
            }

        }

        // validate pause
        if (base.type == "pause") {

            // convert to base.actions
            if (base.action || base.actions) {
                if (base.action) {
                    if (!Array.isArray(base.actions)) base.actions = [];
                    base.actions.push(base.action);
                    delete base.action;
                }
            } else {
                throw new verror("10631: a pause action must include an array of actions to take after the pause.");
            }

            // allow for the actions to only be processed if the condition is still true
            if (base["perform-only-if-unchanged"] != null && base["perform-only-if-unchanged"] === true) {
                // nothing to do
            } else {
                base["perform-only-if-unchanged"] = false;
            }

            // validate actions
            base.actions.forEach(function(action) {
                me.new(action, rule, clause);
            });

            // variables
            base.isPaused = false;
            base.isExpired = false;

            // add the preprocess function
            base.preprocess = function() {
                base.actions.forEach(function(action) {
                    if (typeof action.preprocess === "function") action.preprocess();
                });
            }

            // add the postprocess function (clears any actions that didn't re-fire)
            base.postprocess = function() {
                if (base.isPaused && base.isExpired) {
                    base.isPaused = false;
                    base.isExpired = false;
                    if (base["perform-only-if-unchanged"] === false) {
                        console.error("rule (%s) executing the pause action of clause (%s) was due and even though the condition is no longer true, the resulting actions will be processed as expected.", rule.name, clause);
                        base.actions.forEach(function(action) {
                            action.execute(context);
                        });
                    } else {
                        console.error("rule (%s) executing the pause action of clause (%s) was due however the condition is no longer true, and the resulting actions will NOT be processed.", rule.name, clause);
                    }
                }
                base.actions.forEach(function(action) {
                    if (typeof action.postprocess === "function") action.postprocess();
                });
            }

            // execute method to wait and then process additional actions
            base.execute = function(context) {

                // determine where this is in the cycle
                if (!base.isPaused) {

                    // start the pause
                    base.isPaused = true;
                    base.isExpired = false;
                    setTimeout(function() {
                        base.isExpired = true;
                        context.events.emit("local.service.pause:expired");
                    }, base.pause);
                    console.error("rule (%s) executed clause (%s) which resulted in a pause action for %d seconds.", rule.name, clause, (base.pause / 1000));

                } else if (base.isPaused && base.isExpired) {

                    // process the actions
                    console.error("rule (%s) executing the pause action of clause (%s) was due and the resulting actions will be processed.", rule.name, clause);
                    base.actions.forEach(function(action) {
                        action.execute(context);
                    });

                    // reset 
                    base.isPaused = false;
                    base.isExpired = false;

                } else {
                    // still in pause cycle, so ignore
                }

            }

            // validate, which means to validate each action
            base.validate = function(context) {
                base.actions.forEach(function(action) {
                    action.validate(context);
                });
            }

        }

        // validate webhook
        if (base.type == "webhook") {

            // execute method to contact the webhook
            base.execute = function(context) {
                try {
                    console.log("rule (%s) clause (%s) will execute a webhook (%s).", rule.name, clause, base.uri);
                    request(base, function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            console.log("rule (%s) clause (%s) executed the webhook (%s) successfully.", rule.name, clause, base.uri);
                        } else {
                            console.error(new verror(error, "rule (%s) clause (%s) got an error with response code (%s).", rule.name, clause, response.statusCode));
                        }
                    });
                } catch (ex) {
                    console.error(new verror(ex, "rule (%s) clause (%s) got an exception.", rule.name, clause));
                }
            }

            // validate
            base.validate = function() {
                // nothing to do
            }

        }

        return base;
    }

}