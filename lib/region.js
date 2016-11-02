
const fs = require("fs");
const q = require("q");
const uuid = require("node-uuid");
const instance_manager = require("./instance.js");

module.exports = {
    region: null,
    regions: [],

    load: function(files) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        // load
        files.forEach(function(file) {
            if (file.endsWith(".regions")) {
                const deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            const regions = JSON.parse(contents);
                            regions.forEach(function(region) {
                                me.new(region);
                            });
                            deferred.resolve();
                            console.log("loaded " + file);
                        } catch (ex) {
                            throw new Error("10300: regions config file was not JSON (" + file + ") - " + ex + ".");
                        }
                    } else {
                        throw new Error("10301: regions config file could not be read (" + file + ") - " + error + ".");
                    }
                });
            }
        });

        // consolidate
        q.all(promises).then(function(outer) {
            wrapper.resolve(me.regions);
        });

        return wrapper.promise;
    },

    new: function(base) {
        const me = this;

        // validate region name
        if (base.name == null) {
            throw new Error("10311: each region must have a name.");
        }
        const region_with_same_name = me.regions.find(function(r) { return (r.name == base.name) });
        if (region_with_same_name) {
            throw new Error("10312: region name must be unique (" + base.name + ").");
        }
        if (base.name.indexOf(".") > -1) {
            throw new Error("10313: region name cannot contain periods (" + base.name + ").");
        }

        // validate instances
        if (Array.isArray(base.instances)) {
            base.instances.forEach(function(instance) {
                instance_manager.new(instance, base);
            });
        } else {
            base.instances = [];
        }

        me.regions.push(base);
        return base;
    },

    validate: function(argv) {
        const me = this;

        // ensure an instance is specified
        if (argv.instance == null) {
            throw new Error("10361: the instance must be specified.");
        }

        // determine the local region
        var local_region_count = 0;
        me.regions.forEach(function(region) {

            // see if there is a local instance
            var local_instance = null;
            region.instances.forEach(function(instance) {
                if (instance.name == argv.instance) {

                    // mark instance as local
                    instance.uuid = uuid.v4();
                    instance.isLocal = true;
                    instance.isRemote = false;
                    instance.isConnected = true;
                    local_instance = instance;

                } else {

                    // mark instance as remote
                    instance.isLocal = false;
                    instance.isRemote = true;

                }
            });

            // see if there was a local instance (which makes the region local as well)
            if (local_instance != null) {

                // mark region as local
                region.isLocal = true;
                region.isRemote = false;
                region.instance = local_instance;
                me.region = region;

                // validate priority
                if (region.priority != null) {
                    var int = parseInt(region.priority);
                    if (int !== NaN) {
                        region.priority = int;
                    } else {
                        throw new Error("10321: region priority must be a valid integer (" + region.name + ", " + region.priority + ").");
                    }
                } else {
                    region.priority = 0;
                }

                // validate default-poll
                if (region["default-poll"] != null) {
                    var int = parseInt(region["default-poll"]);
                    if (int !== NaN) {
                        region["default-poll"] = int;
                    } else {
                        throw new Error("10331: region default-poll time must be a valid integer (" + region.name + ", " + region["default-poll"] + ").");
                    }
                } else {
                    region["default-poll"] = 30000;
                }

                // validate process-after-idle
                if (region["process-after-idle"] != null) {
                    var int = parseInt(region["process-after-idle"]);
                    if (int !== NaN) {
                        region["process-after-idle"] = int;
                    } else {
                        throw new Error("10341: region process-after-idle time must be a valid integer (" + region.name + ", " + region["process-after-idle"] + ").");
                    }
                } else {
                    region["process-after-idle"] = 5000;
                }

                // validate poll
                if (region.poll) {
                    throw new Error("10351: you may not specify a poll time for a local region (" + region.name + ").");
                }

                // code to hold an election
                region.elect = function() {

                    // compose a list of possible candidates (first from masters, then from anyone that is reachable)
                    const possible = [];
                    region.instances.forEach(function(instance) {
                        if (instance.isMaster) possible.push(instance);
                    });
                    if (possible.length < 1) {
                        region.instances.forEach(function(instance) {
                            if (instance.isLocal || instance.isConnected) possible.push(instance);
                        });
                    }

                    // sort by uuid and give the election to the first
                    possible.sort(function(a, b) {
                        if (a.uuid == null) return 1;
                        if (b.uuid == null) return -1;
                        return a.uuid.localeCompare(b.uuid);
                    });
                    for (var i = 0; i < possible.length; i++) {
                        possible[i].isMaster = (i === 0);
                        console.log(">>> election: " + possible[i].name + " " + possible[i].isMaster);
                    }

                }

                local_region_count++;
            } else {

                // mark region as remote
                region.isLocal = false;
                region.isRemote = true;

                // validate priority
                if (region.priority) {
                    throw new Error("10322: you may not specify a priority for a remote region (" + region.name + ")");
                }

                // validate default-poll
                if (region["default-poll"]) {
                    throw new Error("10332: you may not specify a default-poll time for a remote region (" + region.name + ").");
                }

                // validate process-after-idle
                if (region["process-after-idle"]) {
                    throw new Error("10342: you may not specify a process-after-idle time for a remote region (" + region.name + ").");
                }

                // validate poll
                if (region.poll != null) {
                    var int = parseInt(region.poll);
                    if (int !== NaN) {
                        region.poll = int;
                    } else {
                        throw new Error("10352: region poll time must be a valid integer ("+ region.name + ", " + region.poll + ").");
                    }
                } else {
                    region.poll = 5000;
                }

            }

        });
        if (local_region_count != 1) {
            throw new Error("10361: there must be exactly one local region and instance across all loaded region files.");
        }

    },

    find: function(region_name, instance_name) {
        const me = this;
        const region = me.regions.find(function(r) { return r.name == region_name });
        if (region && region.isLocal) {
            if (instance_name != null) {
                const instance = region.instances.find(function(i) { return i.name == instance_name });
                if (instance && instance.isRemote) {
                    return instance;
                }
            } else {
                return region;
            }
        }
        return null;
    },

    start: function(context) {
        const me = this;

        // start each region
        me.regions.forEach(function(region) {
            console.log("region (" + region.name + ") " + region.isLocal + " " + region.isRemote);
            if (region.isLocal) {

                // start elections
                if (region.instances.length > 0) {
                    const elect = function() {
                        try {
                            const promises = [];
                            region.instances.forEach(function(instance) {
                                if (instance != region.instance) {
                                    const deferred = q.defer();
                                    promises.push(deferred.promise);
                                    instance.elect.body = {
                                        region: region.name,
                                        instance: region.instance.name,
                                        uuid: region.instance.uuid,
                                        isMaster: region.instance.isMaster
                                    }
                                    instance.elect.execute().then(function(result) {
                                        instance.isConnected = true;
                                        region.instance.isMaster = result.body.isMaster;
                                        if (result.body.isMaster === false && result.body.services) {
                                            context.events.emit("remote.instance:sync", result.body.services);
                                        }
                                        console.log(">>> election in progess, " + instance.name + ", isMaster: " + instance.isMaster);
                                        deferred.resolve(result.body);
                                    }, function(result) {
                                        instance.isConnected = false;
                                        instance.isMaster = false;
                                        console.log(">>> election in progress, " + instance.name + ", error");
                                        deferred.reject(result.body);
                                    });
                                }
                            });
                            q.allSettled(promises).then(function (results) {
                                var successful = results.find(function(result) { return result.state === "fulfilled" });
                                if (successful) {
                                    console.log(">>> election results, " + region.instance.name + " " + region.instance.isMaster);
                                } else {
                                    region.instance.isMaster = true;
                                    console.log(">>> election results, " + region.instance.name + " " + region.instance.isMaster + ", by default");
                                }
                            });
                        } catch (ex) {
                            // better error handling
                            throw ex;
                        }
                        setTimeout(elect, 5000);
                    }
                    setTimeout(elect, 10); // first election is immediate
                } else {
                    console.log("promoted to master because there are no other instances specified.");
                    region.instance.isMaster = true;
                }

                // pick up sync changes to send to slaves
                context.events.on("local.instance:sync", function(services) {
                    region.instances.forEach(function(instance) {
                        if (instance != region.instance) {
                            instance.sync.body = {
                                region: region.name,
                                services: services 
                            }
                            instance.sync.execute();
                        }
                    });
                });

            } else if (region.isRemote) {

                // start polling each remote region instance
                region.instances.forEach(function(instance) {
                    const poll = function() {
                        if (me.region.instance.isMaster) {
                            try {
                                instance.query.execute().then(function(result) {

                                    instance.isConnected = true;
                                    console.log("remote poll succeeded " + instance.name);

                                    // raise a queried event for each service
                                    const response = JSON.parse(result.body);
                                    if (response.services) { // services are only delivered if the instance was the master
                                        response.services.forEach(function(service) {
                                            context.events.emit("remote.service:queried", {
                                                fqn: response.region + "." + service.name,
                                                isLocal: false,
                                                isRemote: true,
                                                state: service.state,
                                                report: service.report,
                                                properties: service.properties
                                            });
                                        });
                                    }

                                }, function(result) {
                                    instance.isConnected = false;
                                    console.log("remote poll failed " + instance.name);
                                });
                            } catch (ex) {
                                console.log("10381: " + ex.message);
                            }
                        }
                        setTimeout(poll, region.poll);
                    }
                    setTimeout(poll, 50); // start polling immediately
                });

            }
        });

    }

}