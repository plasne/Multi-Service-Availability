
var fs = require("fs");
var q = require("q"); 

module.exports = {

    load: function(files) {
        var promises = [];

        files.forEach(function(file) {
            if (file.endsWith(".conditions")) {
                var deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            deferred.resolve(JSON.parse(contents));
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10400: conditions config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10401: conditions config file could not be read (" + file + ") - " + error + ".");
                    }
                });
            }
        });

        return q.all(promises);
    },

    new: function(base) {
        var me = this;
    }

}