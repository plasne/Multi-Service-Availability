
const verror = require("verror");
const request = require("request");

module.exports = {

    new: function(base) {

        // determine the type
        if (base.type == null) {
            if (base.service) {
                base.type = "update";
            } else if (base.uri) {
                base.type = "webhook";
            } else {
                throw new verror("10601: an action could not be identified as either an update or webhook.");
            }
        }

        // validate update type 
        if (base.type == "update") {

            // ensure service is a local reference
            if (base.service.indexOf(".") > -1) {
                throw new verror("10602: an update action can only specify a local service (no multi-part names).");
            }

            // validate there is at least one change
            var count = 0;
            if (base.state) count++;
            if (base.report) count++;
            if (count > 0) {

                // execute method to update all appropriate services
                base.execute = function(context) {
                    context.services.forEach(function(service) {
                        if (service.isLocal && (base.service == "*" || service.name == base.service)) {

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
                if (base.service != "*") {
                    const service = context.services.find(function(s) { return (s.isLocal && s.name == base.service) });
                    if (!service) {
                        throw new verror("10621: an update action tried to update a service (%s) but the service could not be found.", base.service);
                    }
                }
            }

        }

        // validate webhook
        if (base.type == "webhook") {
            base.execute = function(services) {
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