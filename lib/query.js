
const verror = require("verror");
const request = require("request");
const q = require("q");

module.exports = {

    new: function(base) {

        // validate method
        if (base.method == null) {
            base.method = "GET";
        }
        base.method = base.method.toUpperCase();
        if ([ "GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS", "CONNECT" ].indexOf(base.method) < 0) {
            throw new verror("10101: query must have a valid method (%s).", base.method);
        }

        // validate uri
        if (base.uri == null) {
            throw new verror("10102: query must specify a uri.");
        }

        // validate response contains properties
        if (base["response-contains-properties"] == null) {
            base["response-contains-properties"] = false;
        } else if (base["response-contains-properties"] !== true && base["response-contains-properties"] !== false) {
            base["response-contains-properties"] = false;
        } else {
            // leave as is
        }

        // execute the query
        base.execute = function(results) {
            const deferred = q.defer();
            try {
                request(base, function(error, response, body) {
                    
                    // log
                    console.log("RESPONSE FROM %s:", base.uri);
                    if (global.msa_settings.loglevel >= 4) {
                        console.log(JSON.stringify({ error: error, response: response, body: body }));
                    } else {
                        if (response) {
                            console.log(JSON.stringify({ error: error, statusCode: (response.statusCode || 0) }));
                        } else {
                            console.log(JSON.stringify({ error: error }));
                        }
                    }
                    
                    // if results were provided, map to the result
                    var found_result = false;
                    if (Array.isArray(results)) {
                        for (var i = 0; i < results.length; i++) {
                            var result = results[i];
                            if (!found_result && result.isMatch(error, response)) {
                                if (base["response-contains-properties"] === true) {
                                    deferred.resolve({
                                        "result": result,
                                        "include-properties": true,
                                        "body": body
                                    });
                                } else {
                                    deferred.resolve({ result: result });
                                }
                                found_result = true;
                            }
                        } 
                    }

                    // return the proper object
                    if (!found_result) {
                        if (!error && response.statusCode == 200) {
                            deferred.resolve({ response: response, body: body });
                        } else {
                            deferred.reject({ error: error, response: response });
                        }
                    }

                });
            } catch (ex) {
                deferred.reject({ error: ex });
            }
            return deferred.promise;
        }

        return base;
    }

}