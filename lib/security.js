
const constants = require("constants");
const fs = require("fs");
const q = require("q");
const njwt = require("njwt");

module.exports = {

    readCertificateAndKey: function() {
        const deferred = q.defer();
        fs.access("./config/cert.pem", fs.constants.R_OK, function(err) {
            if (!err) {
                fs.access("./config/key.pem", fs.constants.R_OK, function(err) {
                    if (!err) {
                        const options = {
                            cert: fs.readFileSync("./config/cert.pem"),
                            key: fs.readFileSync("./config/key.pem"),
                            passphrase: global.msa_settings.certificate_passphrase
                        }
                        global.msa_settings.protocol = "https";
                        deferred.resolve(options);
                    } else {
                        deferred.resolve();
                    }
                });
            } else {
                deferred.resolve();
            }
        });
        return deferred.promise;
    },

    token_cache: [],

    authenticate: function(req, key) {
        const me = this;
        const deferred = q.defer();

        // authentication is only possible if a secret was defined
        if (global.msa_settings.secret) {
            try {
                if (req.get("Authorization") != null) {
                    const token = req.get("Authorization").replace("Bearer ", "");

                    // ensure the token can be validated
                    njwt.verify(token, key, function(err, verified) {
                        if (!err) {
                            deferred.resolve(verified);
                        } else {
                            deferred.reject(err);
                        }
                    });

                    // ensure the token is only used once (necessary so there cannot be replay attacks when SSL isn't used)
                    if (me.token_cache.find(function(entry) { return (entry.token == token); })) {
                        deferred.reject(new verror("authentication found a token that was used before"));
                    } else {
                        const now = Date.now();
                        const oneMinAgo = now - 60000;
                        while (me.token_cache.length > 0 && me.token_cache[0].usedAt < oneMinAgo) {
                            me.token_cache.splice(0, 1);
                        }
                        me.token_cache.push({ token: token, usedAt: now });
                    }

                } else {
                    deferred.reject(new verror("authentication didn't find a token in the request"));
                }
        } catch (ex) {
                deferred.reject(ex);
            }
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    }


}