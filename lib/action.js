
const verror = require("verror");
const request = require("request");

module.exports = {

    new: function(base) {

        // determine the type
        if (base.type == null) {
            if (base.service || base.services) {
                base.type = "update";
            } else if (base.pause) {
                base.type = "pause";
            } else if (base.uri) {
                base.type = "webhook";
            } else {
                throw new verror("10601: an action could not be identified as either an update or webhook.");
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
            if (base["perform-only-if-still-true"] != null && base["perform-only-if-still-true"] === false) {
                // nothing to do
            } else {
                base["perform-only-if-still-true"] = true;
            }

            // validate actions
            base.actions.forEach(function(action) {
                me.new(action);
            });

            // execute method to wait and then process additional actions
            base.execute = function(context) {
                
            }

            base.validate = function(context) {
                base.actions.forEach(function(action) {
                    action.validate(context);
                });
            }

        }

        // validate webhook
        if (base.type == "webhook") {
            base.execute = function(context) {
                try {
                    request(base, function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            // log success (verbose)
                        } else {
                            // log exception
                        }
                    });
                } catch (ex) {
                    // log exception
                }
            }
        }

        return base;
    }

}