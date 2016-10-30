
module.exports = {

    valid_keywords: [ "timeout", "error" ],

    new: function(base) {
        var me = this;

        // validate responses
        var responses = [];
        var toResponse = function(o) {
            if (typeof o === "string" || o instanceof String) {
                if (o.indexOf(",") > -1) {
                    toResponses(o.split(",")); // iterate
                } else if (o.indexOf("-") > -1) {
                    var range = o.split("-");
                    var min = parseInt(o[0]);
                    var max = parseInt(o[o.length - 1]);
                    if (min === NaN || max === NaN) {
                        throw new Error("10201: an invalid result response was found (" + o + ").");
                    }
                    responses.push(o);
                } else if (!isNaN(o)) {
                    var int = parseInt(o);
                    if (int !== NaN) {
                        responses.push(int);
                    } else {
                        throw new Error("10202: an invalid result response was found (" + o + ").");
                    }
                } else {
                    o = o.trim().toLowerCase();
                    if (me.valid_keywords.indexOf(o) > -1) {
                        responses.push(o);
                    } else {
                        throw new Error("10203: an invalid result response was found (" + o + ").");
                    }
                }
            } else if (typeof o === "number" || o instanceof Number) {
                var int = parseInt(o);
                if (int !== NaN) {
                    responses.push(int);
                } else {
                    throw new Error("10204: an invalid result response was found (" + o + ").");
                }
            } else {
                throw new Error("10205: an invalid result response was found (" + o + ").");
            }
        }
        var toResponses = function(o) {
            if (Array.isArray(o)) {
                o.forEach(function(e) {
                    toResponse(e);
                });
            } else {
                toResponse(o);
            }
        }
        if (base.response != null) {
            toResponses(base.response);
            delete base.response;
        }
        if (base.responses != null) {
            toResponses(base.responses);
        }
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
                console.log(base.responses);
                for (var i = 0; i < base.responses.length; i++) {
                    var possible = base.responses[i];
                    if (error) {
                        if (possible == "timeout" && (error.code === "ETIMEDOUT" || error.connect === true)) {
                            return true;
                        } else if (possible == "error") {
                            return true;
                        }
                    } else if (!isNaN(possible)) {
                        if (response.statusCode == possible) {
                            return true;
                        }
                    } else if (possible.indexOf("-") > -1) {
                        var range = possible.split("-");
                        var min = parseInt(range[0]);
                        var max = parseInt(range[range.length - 1]);
                        if (min !== NaN && max !== NaN) {
                            if (response.statusCode >= min && response.statusCode <= max) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }
        }

    }

}