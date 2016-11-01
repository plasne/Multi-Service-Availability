
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
                throw new Error("10601: an action could not be identified as either an update or webhook.");
            }
        }

        // validate update type 
        if (base.type == "update") {

            // ensure service is a local reference
            if (base.service.indexOf(".") > -1) {
                throw new Error("10602: an update action can only specify a local service (no multi-part names).");
            }

            // validate there is at least one change
            var count = 0;
            if (base.state) count++;
            if (base.report) count++;
            if (base["add-property"]) count++;
            if (base["remove-property"]) count++;
            if (count > 0) {
                base.execute = function(context) {
                    const service = context.services.find(function(s) { return (s.isLocal && s.name == base.service) });
                    if (service) {
                        if (base.state && service.state != base.state) {
                            service.state = base.state;
                        }
                        if (base.report) {
                            service.reportInherits = false;
                            if (service.report != base.report) {
                                service.report = base.report;
                            }
                        }
                        if (base["add-property"]) {
                            var p = base["add-property"];
                            if (service.properties.indexOf(p) < 0) {
                                service.properties.push(p);
                            }
                        }
                        if (base["remove-property"]) {
                            var p = base["remove-property"];
                            var i = service.properties.indexOf(p);
                            if (i >= 0) {
                                service.properties.splice(i, 1);
                            }
                        }
                    } else {
                        throw new Error("10602: an update action tried to update a service (" + base.service + ") but the service could not be found.");
                    }
                }
            } else {
                throw new Error("10603: an update action must have at least one state, report, add-property, or remove-property node.");
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