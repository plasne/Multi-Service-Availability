
module.exports = {

    new: function(base) {
        var me = this;

        // validate responses
        var responses = [];
        var toResponses = function(o) {
            if (Array.isArray(o)) {
                o.forEach(function(e1) {
                    if (e1.indexOf(",") > -1) {
                        e1.split(",").forEach(function(e2) {
                            if (typeof e2 === "string" || e2 instanceof String) {
                                response.push(e2.trim().toLowerCase());
                            } else if (!isNaN(e2)) {
                                responses.push(e2);
                            } else {
                                throw new Error("10202: result responses must be a string or number.");
                            }
                        });
                    } else {
                        responses.push(e1);
                    }
                });
            } else if (typeof o === "string" || o instanceof String) {
                responses.push(o.trim().toLowerCase());
            } else if (!isNaN(o)) {
                responses.push(o);
            } else {
                throw new Error("10203: result responses must be a string or number (" + typeof o + ").");
            }
        }
        if (base.response != null) {
            toResponses(base.response);
            delete base.response;
        }
        if (base.responses != null) toResponses(base.responses);
        base.responses = responses;

        // validate state
        if (base.state == null) {
            throw new Error("10211: results must include a state.")
        }

        // see if the result can be matched to the response
        base.isMatch = function(error, response) {
            if (base.responses.length < 1) {
                return true;
            } else {
                for (var i = 0; i < base.responses.length; i++) {
                    var possible = base.responses[i];
                    if (error) {
                        if (possible == "timeout" && (error.code === "ETIMEDOUT" || error.connect === true)) {
                            return true;
                        } else if (possible == "error") {
                            return true;
                        }
                    } else if (possible.indexOf("-") > -1) {
                        var range = possible.split("-");
                        var min = range[0];
                        var max = range[range.length - 1];
                        if (!isNaN(min) && !isNaN(max)) {
                            if (response.statusCode >= min && response.statusCode <= max) {
                                return true;
                            }
                        }
                    } else if (!isNaN(possible)) {
                        if (response.statusCode == possible) {
                            return true;
                        }
                    }
                }
                return false;
            }
        }

    }

}