
const verror = require("verror");
const fs = require("fs");
const q = require("q");
const uuid = require("node-uuid");
const os = require("os");
const dns = require("dns");
const instance_manager = require("./instance.js");

module.exports = {
    region: null,
    regions: [],

    load: function(files, discovered_instances) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        // discovery
        const deferred_discovery = q.defer();
        var discovered_instances = null;
        if (typeof global.msa_settings.discover_dns == "string" && typeof global.msa_settings.discover_port == "number") {

            // lookup the provided dns name for round-robin addresses
            dns.lookup(global.msa_settings.discover_dns, {
                family: 4,
                all: true
            }, function(error, addresses) {
                if (!error) {
                    if (addresses.length > 0) {

                        // create the instance array
                        addresses.sort(function(a, b) {
                            return a.address.localeCompare(b.address);
                        });
                        var instance_count = 0;
                        discovered_instances = addresses.map(function(a) {
                            const entry = {
                                name: global.msa_settings.instance + "-" + instance_count,
                                port: parseInt(global.msa_settings.discover_port),
                                fqdn: a.address
                            }
                            console.info("instance discovered to be (name: %s, FQDN: %s).", entry.name, entry.fqdn);
                            instance_count++;
                            return entry;
                        });

                        // see if any of those names match the current system
                        const nics = os.networkInterfaces();
                        Object.keys(nics).forEach(function(key) {
                            const nic = nics[key];
                            nic.forEach(function(entry) {
                                const found = discovered_instances.find(function(a) { return a.fqdn == entry.address });
                                if (found) {
                                    console.info("local instance was identified as (name: %s, FQDN: %s).", found.name, found.fqdn);
                                    global.msa_settings.instance = found.name;
                                }
                            });
                        });

                        // make sure one of the entries was local
                        if (discovered_instances.find(function(a) { return a.name == global.msa_settings.instance }) == null) {
                            throw new verror(error, "10002: none of the discover DNS entries (%s) matched an address on this system.", discover_dns); 
                        }

                        deferred_discovery.resolve();
                    } else {
                        throw new verror(error, "10003: the discover DNS entry (%s) did not find any addresses.", discover_dns);
                    }
                } else {
                    throw new verror(error, "10004: the discover DNS entry (%s) could not be resolved.", discover_dns);
                }
            });
        } else {
            deferred_discovery.resolve();
        }

        // load after the discovery phase (in parallel)
        deferred_discovery.promise.then(function() {

            // load each file
            files.forEach(function(file) {
                if (file.endsWith(".regions")) {
                    const deferred_load = q.defer();
                    promises.push(deferred_load.promise);
                    fs.readFile("./config/" + file, function(error, contents) {
                        if (!error) {
                            try {
                                const regions = JSON.parse(contents);
                                regions.forEach(function(region) {
                                    me.new(region, discovered_instances);
                                });
                                deferred_load.resolve();
                                console.info("loaded %s.", file);
                            } catch (ex) {
                                throw new verror(ex, "10300: regions config file (%s) was not valid.", file);
                            }
                        } else {
                            throw new verror(error, "10301: regions config file (%s) could not be read.", file);
                        }
                    });
                }
            });

            // consolidate
            q.all(promises).then(function(outer) {
                wrapper.resolve(me.regions);
            });

        }).done();

        return wrapper.promise;
    },

    new: function(base, discovered_instances) {
        const me = this;

        // validate region name
        if (base.name == null) {
            throw new verror("10311: each region must have a name.");
        }
        const region_with_same_name = me.regions.find(function(r) { return (r.name == base.name) });
        if (region_with_same_name) {
            throw new verror("10312: region name (%s) must be unique.", base.name);
        }
        if (base.name.indexOf(".") > -1) {
            throw new verror("10313: region name (%s) cannot contain periods.", base.name);
        }

        // validate instances
        if (Array.isArray(base.instances)) {
            // allow it to pass through
        } else if (discovered_instances != null) {
            base.instances = discovered_instances;
        } else {
            base.instances = [];
        }
        base.instances.forEach(function(instance) {
            instance_manager.new(instance);
        });

        me.regions.push(base);
        return base;
    },

    validate: function(context) {
        const me = this;

        // determine the local region
        var local_region_count = 0;
        me.regions.forEach(function(region) {

            // see if there is a local instance
            var local_instance = null;
            region.instances.forEach(function(instance) {
                if (instance.name == global.msa_settings.instance) {

                    // mark instance as local
                    console.info("instance (%s) in region (%s) is identified as the local instance.", instance.name, region.name);
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
                context.region = region;

                // validate priority
                if (region.priority != null) {
                    var int = parseInt(region.priority);
                    if (int !== NaN) {
                        region.priority = int;
                    } else {
                        throw new verror("10321: region (%s) priority must be a valid integer (%s).", region.name, region.priority);
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
                        throw new verror("10331: region (%s) default-poll time must be a valid integer (%s).", region.name, region["default-poll"]);
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
                        throw new verror("10341: region (%s) process-after-idle time must be a valid integer (%s).", region.name, region["process-after-idle"]);
                    }
                } else {
                    region["process-after-idle"] = 5000;
                }

                // validate poll
                if (region.poll) {
                    throw new verror("10351: you may not specify a poll time for a local region (%s).", region.name);
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
                        console.log("election vote: %s, master? %s", possible[i].name, possible[i].isMaster);
                    }

                }

                local_region_count++;
            } else {

                // mark region as remote
                region.isLocal = false;
                region.isRemote = true;

                // validate priority
                if (region.priority) {
                    throw new verror("10322: you may not specify a priority for a remote region (%s).", region.name);
                }

                // validate default-poll
                if (region["default-poll"]) {
                    throw new verror("10332: you may not specify a default-poll time for a remote region (%s).", region.name);
                }

                // validate process-after-idle
                if (region["process-after-idle"]) {
                    throw new verror("10342: you may not specify a process-after-idle time for a remote region (%s).", region.name);
                }

                // validate poll
                if (region.poll != null) {
                    var int = parseInt(region.poll);
                    if (int !== NaN) {
                        region.poll = int;
                    } else {
                        throw new verror("10352: region (%s) poll time must be a valid integer (%s).", region.name, region.poll);
                    }
                } else {
                    region.poll = 5000;
                }

            }

        });
        if (local_region_count != 1) {
            throw new verror("10361: there must be exactly one local region and instance across all loaded region files.");
        }

    },

    find: function(region_name, instance_name) {
        const me = this;
        if (typeof region_name == "string") {

            // search for region and possibly instance
            const region = me.regions.find(function(r) { return r.name == region_name });
            if (region && region.isLocal) {
                if (instance_name != null) {
                    var instance = region.instances.find(function(i) { return i.name == instance_name });
                    if (instance && instance.isRemote) {
                        return instance;
                    }
                } else {
                    return region;
                }
            }
        } else {

            // search for instance across all regions
            for (var i = 0; i < me.regions.length; i++) {
                var instance = me.regions[i].instances.find(function(i) { return i.name == instance_name });
                if (instance) return instance;
            }

        }
        return null;
    },

    start: function(context) {
        const me = this;

        // start each region
        me.regions.forEach(function(region) {
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
                                        console.log("election in-progress: local (%s, master? %s), remote SUCCESS (%s, master? %s).", region.instance.name, result.body.isMaster, instance.name, instance.isMaster);
                                        deferred.resolve(result.body);
                                    }, function(result) {
                                        instance.isConnected = false;
                                        instance.isMaster = false;
                                        console.log("election in-progress: local (%s, master? %s), remote FAILURE (%s, master? %s).", region.instance.name, region.instance.isMaster, instance.name, instance.isMaster);
                                        deferred.reject(result.body);
                                    }).done();
                                }
                            });
                            q.allSettled(promises).then(function(results) {
                                var successful = results.find(function(result) { return result.state === "fulfilled" });
                                if (successful) {
                                    var total = region.instances.map(function(instance) {
                                        return "(%s, master? %s)".format(instance.name, instance.isMaster);
                                    });
                                    console.info("election results: ", total.join(", "));
                                } else {
                                    region.instance.isMaster = true;
                                    console.info("election results: (%s, master? %s) because no other nodes were reachable.", region.instance.name, region.instance.isMaster);
                                }
                            }).done();
                        } catch (ex) {
                            // this should never happen, but the catch is here just in case it does
                            throw new verror(ex, "10371: unhandled exception on region.elect (%s).", region.name);
                        }
                        setTimeout(elect, 5000);
                    }
                    setTimeout(elect, 10); // first election is immediate
                } else {
                    region.instance.isMaster = true;
                    console.info("election results: (%s, master? %s) because there are no other instances specified.", region.instance.name, region.instance.isMaster);
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

                                    // log
                                    instance.isConnected = true;
                                    console.log("querying (%s) for remote status succeeded.", instance.name);

                                    // raise a queried event for each service
                                    if (result.body.services) { // services are only delivered if the instance was the master
                                        result.body.services.forEach(function(service) {
                                            context.events.emit("remote.service:queried", {
                                                fqn: result.body.region + "." + service.name,
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
                                    console.log("querying (%s) for remote status failed.", instance.name);
                                }).done();
                            } catch (ex) {
                                // this should never happen, but the catch is here just in case it does
                                throw new verror(ex, "10381: unhandled exception on region.query (%s).", region.name);
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