
const verror = require("verror");

module.exports = {

    valid_keywords: [ "timeout", "error" ],

    new: function(base, mode) {
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
                        throw new verror("10201: an invalid result response was found (%s).", o);
                    }
                    responses.push(o);
                } else if (!isNaN(o)) {
                    var int = parseInt(o);
                    if (int !== NaN) {
                        responses.push(int);
                    } else {
                        throw new verror("10202: an invalid result response was found (%s).", o);
                    }
                } else {
                    o = o.trim().toLowerCase();
                    if (me.valid_keywords.indexOf(o) > -1) {
                        responses.push(o);
                    } else {
                        throw new verror("10203: an invalid result response was found (%s).", o);
                    }
                }
            } else if (typeof o === "number" || o instanceof Number) {
                var int = parseInt(o);
                if (int !== NaN) {
                    responses.push(int);
                } else {
                    throw new verror("10204: an invalid result response was found (%s).", o);
                }
            } else {
                throw new verror("10205: an invalid result response was found (%s).", o);
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
        var states = [];
        var toState = function(o) {
            if (typeof o === "string" || o instanceof String) {
                if (o.indexOf(",") > -1) {
                    toStates(o.split(",")); //iterate
                } else {
                    o = o.trim().toLowerCase();
                    states.push(o);
                }
            } else if (typeof o == number || o instanceof Number) {
                states.push(o.toString());
            }
        }
        var toStates = function(o) {
            if (Array.isArray(o)) {
                o.forEach(function(e) {
                    toState(e);
                });
            } else {
                toState(o);
            }
        }
        if (base.state != null) {
            toStates(base.state);
            delete base.state;
        }
        if (base.states != null) {
            toStates(base.states);
        }
        base.states = states;

        // finish configuration based on mode
        if (mode == "in") {
            if (base.states.length != 1) throw new verror("10211: an in/result must include exactly one state.");

            // validate apply-after
            if (base["apply-after"] == null) {
                base["apply-after"] = 1;
            } else {
                var int = parseInt(base["apply-after"]);
                if (int !== NaN) {
                    base["apply-after"] = int;
                } else {
                    throw new verror("10212: an in/result/apply-after property must be a valid integer (%s).", base["apply-after"]);
                }
            }

            // see if a result can be matched to the response
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

        } else if (mode == "out") {
            if (base.responses.length != 1) throw new verror("10221: an out/result must include exactly one response.");

            // validate apply-after
            if (base["apply-after"] != null) {
                throw new verror("10222: an out/result may not specify apply-after.");
            }

            // see if a result can be matched to the state
            base.isMatch = function(state) {
                if (base.states.length < 1) {
                    return true;
                } else {
                    for (var i = 0; i < base.states.length; i++) {
                        var possible = base.states[i];
                        if (state == possible) {
                            return true;
                        }
                    }
                }
                return false;
            }

        }

    }

}