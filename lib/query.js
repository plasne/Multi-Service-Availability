
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

        // execute the query
        base.execute = function(results) {
            const deferred = q.defer();
            try {
                request(base, function(error, response, body) {
                    // todo: should log response regardless
                    if (Array.isArray(results)) {
                        for (var i = 0; i < results.length; i++) {
                            var result = results[i];
                            if (result.isMatch(error, response)) {
                                deferred.resolve(result);
                            }
                        } 
                    }
                    if (!error && response.statusCode == 200) {
                        deferred.resolve({ response: response, body: body });
                    } else {
                        deferred.reject({ error: error, response: response });
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