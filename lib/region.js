
const verror = require("verror");
const fs = require("fs");
const q = require("q");
const os = require("os");
const dns = require("dns");
const crypto = require("crypto");
const njwt = require("njwt");
const instance_manager = require("./instance.js");

module.exports = {
    region: null,
    regions: [],

    discover: function () {
        const me = this;
        const deferred = q.defer();

        // discovery
        var discovered_instances = null;
        if (typeof global.msa_settings.discover_dns == "string" && typeof global.msa_settings.discover_port == "number") {

            // lookup the provided dns name for round-robin addresses
            dns.lookup(global.msa_settings.discover_dns, {
                family: 4,
                all: true
            }, function (error, addresses) {
                if (!error) {
                    if (addresses.length > 0) {
                        if (global.msa_settings.loglevel >= 4) console.log("DNS (%s) resolved to (%s).", global.msa_settings.discover_dns, JSON.stringify(addresses));

                        // create the instance array
                        addresses.sort(function (a, b) {
                            return a.address.localeCompare(b.address);
                        });
                        var instance_count = 0;
                        discovered_instances = addresses.map(function (a) {
                            const entry = {
                                name: a.address,
                                port: parseInt(global.msa_settings.discover_port),
                                fqdn: a.address
                            }
                            if (me.region && me.region.instances.find(function (i) { return i.name == entry.name })) {
                                // no message, this has been found before
                            } else {
                                console.info("instance discovered to be (name: %s, FQDN: %s).", entry.name, entry.fqdn);
                            }
                            instance_count++;
                            return entry;
                        });

                        // see if any of those names match the current instance
                        const nics = os.networkInterfaces();
                        Object.keys(nics).forEach(function (key) {
                            const nic = nics[key];
                            nic.forEach(function (entry) {
                                const found = discovered_instances.find(function (a) { return a.fqdn == entry.address });
                                if (found) {
                                    if (me.region) {
                                        // no message, this should have been found before
                                    } else {
                                        console.info("local instance was identified as (name: %s, FQDN: %s).", found.name, found.fqdn);
                                    }
                                    global.msa_settings.instance = found.name;
                                }
                            });
                        });

                        // make sure one of the entries was local
                        if (discovered_instances.find(function (a) { return a.name == global.msa_settings.instance }) == null) {
                            throw new verror(error, "10002: none of the discover DNS entries (%s) matched an address on this system.", global.msa_settings.discover_dns);
                        }

                        deferred.resolve(discovered_instances);
                    } else {
                        // log as error but don't stop execution
                        console.error("10003: the discover DNS entry (%s) did not find any addresses.", global.msa_settings.discover_dns);
                        deferred.reject(discovered_instances);
                    }
                } else {
                    // log as error but don't stop execution
                    console.error(new verror(error, "10004: the discover DNS entry (%s) could not be resolved.", global.msa_settings.discover_dns).message);
                    deferred.reject(discovered_instances);
                }
            });
        } else {
            deferred.resolve(discovered_instances);
        }

        return deferred.promise;
    },

    load: function (files) {
        const me = this;
        const wrapper = q.defer();
        const promises_outer = [];
        const promises_inner = [];

        // load after the discovery phase (in parallel)
        me.discover().done(function (discovered_instances) {

            // load each file
            var count = 0;
            files.forEach(function (file) {
                if (file.endsWith(".regions")) {
                    const deferred_load = q.defer();
                    promises_outer.push(deferred_load.promise);
                    fs.readFile("./config/" + file, function (error, contents) {
                        if (!error) {
                            try {
                                const regions = JSON.parse(contents);
                                regions.forEach(function (region) {
                                    const deferred_region = me.new(region, discovered_instances);
                                    promises_inner.push(deferred_region);
                                });
                                deferred_load.resolve();
                                console.info("loaded %s (%d files).", file, count);
                            } catch (ex) {
                                throw new verror(ex, "10300: regions config file (%s) was not valid.", file);
                            }
                        } else {
                            throw new verror(error, "10301: regions config file (%s) could not be read.", file);
                        }
                    });
                    count++;
                }
            });

            // consolidate
            q.all(promises_outer).then(function() {
                q.all(promises_inner).then(function() { // must have an inner all because they are potentially added after promises_outer would be processed
                    wrapper.resolve(me.regions);
                });
            });

        });

        return wrapper.promise;
    },

    new: function (base, discovered_instances) {
        const me = this;
        const deferred = q.defer();

        // validate region name
        if (base.name == null) {
            throw new verror("10311: each region must have a name.");
        }
        const region_with_same_name = me.regions.find(function (r) { return (r.name == base.name) });
        if (region_with_same_name) {
            throw new verror("10312: region name (%s) must be unique.", base.name);
        }
        if (base.name.indexOf(".") > -1) {
            throw new verror("10313: region name (%s) cannot contain periods.", base.name);
        }

        // validate instances
        if (Array.isArray(base.instances)) {
            // allow it to pass through
            if (global.msa_settings.loglevel >= 4) console.log("region (%s) found %d instances in a regions config file.", base.name, base.instances.length);
        } else if (Array.isArray(discovered_instances)) {
            base.instances = discovered_instances;
            if (global.msa_settings.loglevel >= 4) console.log("region (%s) found %d instances by DNS discovery.", base.name, base.instances.length);
        } else {
            base.instances = [];
            if (global.msa_settings.loglevel >= 4) console.log("region (%s) found no instances either in config or by DNS discovery.", base.name);
        }
        base.instances.forEach(function (instance) {
            instance_manager.new(instance, base);
        });

        // validate salt
        if (global.msa_settings.secret != null) {
            if (base.salt == null) {
                throw new verror("10314: region (%s) must specify a salt value because secured communication was specified.", base.name);
            } else if (base.salt.length < 32) {
                throw new verror("10315: region (%s) specified a salt value, but it was too short, it must be at least 32 characters long.", base.name);
            } else {
                const iterations = 273342;
                const key = crypto.pbkdf2(global.msa_settings.secret, base.salt, iterations, 32, "sha256", function (err, bytes) {
                    if (err) {
                        throw new verror("10316: region (%s) could not generate a key from the secret and salt.", base.name);
                    } else {
                        base.key = bytes.toString("hex");
                        if (global.msa_settings.loglevel >= 4) console.log("region (%s) generated key (%s).", base.name, base.key);
                        deferred.resolve(base);
                    }
                });
            }
        } else {
            base.key = "nokey";
            if (global.msa_settings.loglevel >= 4) console.log("region (%s) generated key (%s).", base.name, base.key);
            deferred.resolve(base);
        }

        me.regions.push(base);
        return deferred.promise;
    },

    validate: function (context) {
        const me = this;

        // determine the local region
        var local_region_count = 0;
        me.regions.forEach(function (region) {

            // see if there is a local instance
            var local_instance = null;
            region.instances.forEach(function (instance) {
                if (instance.name == global.msa_settings.instance) {

                    // mark instance as local
                    console.info("instance (%s) in region (%s) is identified as the local instance.", instance.name, region.name);
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

                // validate process-rules-every
                if (region["process-rules-every"] != null) {
                    var int = parseInt(region["process-rules-every"]);
                    if (int !== NaN) {
                        if (int <= region["process-after-idle"]) {
                            throw new verror("10351: region (%s) process-rules-every time must be greater than process-after-idle.", region.name);
                        } else {
                            region["process-rules-every"] = int;
                        }
                    } else {
                        throw new verror("10352: region (%s) process-rules-every time must be a valid integer (%s).", region.name, region["process-rules-every"]);
                    }
                }

                // validate poll
                if (region.poll) {
                    throw new verror("10361: you may not specify a poll time for a local region (%s).", region.name);
                }

                // code to hold an election
                region.elect = function () {

                    // compose a list of possible candidates (first from masters, then from anyone that is reachable)
                    const possible = [];
                    region.instances.forEach(function (instance) {
                        if (instance.isMaster) possible.push(instance);
                    });
                    if (possible.length < 1) {
                        region.instances.forEach(function (instance) {
                            if (instance.isLocal || instance.isConnected) possible.push(instance);
                        });
                    }

                    // sort by oldest first, then by name
                    possible.sort(function (a, b) {
                        if (a.masterSince == null && b.masterSince == null) {
                            return a.name.localeCompare(b.name);
                        } else if (a.masterSince == null) {
                            return 1; // make b a lower index than a
                        } else if (b.masterSince == null) {
                            return -1; // make a lower index than b
                        } else {
                            return a.masterSince - b.masterSince;
                        }
                    });
                    for (var i = 0; i < possible.length; i++) {
                        if (i === 0) {
                            if (!possible[0].isMaster) {
                                possible[0].isMaster = true;
                                possible[0].masterSince = Date.now();
                            }
                        } else {
                            possible[i].isMaster = false;
                            possible[i].masterSince = null;
                        }
                        console.log("election vote: %s, master? %s, since? %s", possible[i].name, possible[i].isMaster, (possible[i].masterSince || "-"));
                    }

                }

                local_region_count++;
            } else {

                // mark region as remote
                region.isLocal = false;
                region.isRemote = true;
                region.clearcounter = 0;

                // validate priority
                if (region.priority != null) {
                    throw new verror("10322: you may not specify a priority for a remote region (%s).", region.name);
                }

                // validate default-poll
                if (region["default-poll"] != null) {
                    throw new verror("10332: you may not specify a default-poll time for a remote region (%s).", region.name);
                }

                // validate process-after-idle
                if (region["process-after-idle"] != null) {
                    throw new verror("10342: you may not specify a process-after-idle time for a remote region (%s).", region.name);
                }

                // validate process-rules-every
                if (region["process-rules-every"] != null) {
                    throw new verror("10353: you may not specify a process-rules-every time for a remote region (%s).", region.name);
                }

                // validate clear-after
                if (region["clear-after"] != null) {
                    var int = parseInt(region["clear-after"]);
                    if (int !== NaN) {
                        region["clear-after"] = int;
                    } else {
                        throw new verror("10341: region (%s) clear-after must be a valid integer (%s).", region.name, region["clear-after"]);
                    }
                } else {
                    region["clear-after"] = 0; // never clear
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
            throw new verror("10371: there must be exactly one local region and instance across all loaded region files.");
        }

    },

    find: function (region_name, instance_name) {
        const me = this;
        if (typeof region_name == "string") {

            // search for region and possibly instance
            const region = me.regions.find(function (r) { return r.name == region_name });
            if (region && region.isLocal) {
                if (instance_name != null) {
                    var instance = region.instances.find(function (i) { return i.name == instance_name });
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
                var instance = me.regions[i].instances.find(function (i) { return i.name == instance_name });
                if (instance) return instance;
            }

        }
        return null;
    },

    start: function (context) {
        const me = this;

        // start each region
        me.regions.forEach(function (region) {
            if (region.isLocal) {

                // start elections
                if (region.instances.length > 0) {
                    const elect = function () {
                        try {
                            if (global.msa_settings.loglevel >= 4) console.log("election started.");

                            // look for any DNS changes                            
                            me.discover().done(function (discovered_instances) {
                                if (Array.isArray(discovered_instances)) {

                                    // add any new instances
                                    discovered_instances.forEach(function (di) {
                                        const found = me.region.instances.find(function (i) { return i.name == di.name });
                                        if (!found) {
                                            me.region.instances.push(instance_manager.new(di, me.region));
                                            di.isRemote = true;
                                            di.isLocal = false;
                                            console.info("the DNS discovery process added a new instance (%s).", di.name);
                                        }
                                    });

                                    // remove any old instances
                                    const to_remove = [];
                                    me.region.instances.forEach(function (i) {
                                        const found = discovered_instances.find(function (di) { return di.name == i.name });
                                        if (found && found.isLocal) {
                                            throw new verror("10371: the local instance was identified for removal by DNS.");
                                        } else if (!found) {
                                            to_remove.push(i);
                                        }
                                    });
                                    to_remove.forEach(function (i) {
                                        const index = me.region.instances.indexOf(i);
                                        if (index > -1) {
                                            me.region.instances.splice(index, 1);
                                            console.info("the DNS discovery process removed an instance (%s).", i.name);
                                        }
                                    });

                                }

                                // contact all remote
                                const promises = [];
                                region.instances.forEach(function (instance) {
                                    if (instance != region.instance) {
                                        const deferred = q.defer();
                                        promises.push(deferred.promise);
                                        const jwt = njwt.create({ iss: "msa", sub: "elect" }, region.key);
                                        jwt.setExpiration(new Date().getTime() + (1 * 60 * 1000)); // 1 min
                                        instance.elect.headers.Authorization = "Bearer " + jwt.compact();
                                        instance.elect.body = {
                                            region: region.name,
                                            instance: region.instance.name,
                                            isMaster: region.instance.isMaster,
                                            masterSince: region.instance.masterSince
                                        }
                                        instance.elect.execute().then(function (result) {
                                            instance.isConnected = true;
                                            if (result.body.isMaster) {
                                                instance.isMaster = false;
                                                instance.masterSince = null;
                                                if (!region.instance.isMaster) {
                                                    region.instance.isMaster = true;
                                                    region.instance.masterSince = Date.now();
                                                }
                                            } else {
                                                region.instance.isMaster = false;
                                                region.instance.masterSince = null;
                                                if (result.body.services) context.events.emit("remote.instance:sync", result.body.services);
                                            }
                                            console.log("election in-progress: local (%s, master? %s), remote SUCCESS (%s, master? %s).", region.instance.name, region.instance.isMaster, instance.name, instance.isMaster);
                                            result.body.self = instance.name;
                                            deferred.resolve(result.body);
                                        }, function (result) {
                                            instance.isConnected = false;
                                            instance.isMaster = false;
                                            instance.masterSince = null;
                                            console.log("election in-progress: local (%s, master? %s), remote FAILURE (%s, master? %s).", region.instance.name, region.instance.isMaster, instance.name, instance.isMaster);
                                            deferred.reject(result.body);
                                        }).done();
                                    }
                                });
                                q.allSettled(promises).then(function (results) {
                                    const successful = results.find(function (result) { return result.state === "fulfilled" });
                                    if (successful) {
                                        var total = region.instances.map(function (instance) {
                                            return "(%s, master? %s)".format(instance.name, instance.isMaster);
                                        });
                                        console.info("election results: ", total.join(", "));
                                    } else {
                                        region.instance.isMaster = true;
                                        region.instance.masterSince = Date.now();
                                        console.info("election results: (%s, master? %s) because no other nodes were reachable.", region.instance.name, region.instance.isMaster);
                                    }
                                }).done();

                            });

                        } catch (ex) {
                            throw new verror(ex, "10381: unhandled exception on region.elect (%s).", region.name);
                        }
                        setTimeout(elect, 5000);
                    }
                    setTimeout(elect, 10); // first election is immediate
                } else {
                    region.instance.isMaster = true;
                    console.info("election results: (%s, master? %s) because there are no other instances specified.", region.instance.name, region.instance.isMaster);
                }

                // pick up sync changes to send to slaves
                context.events.on("local.instance:sync", function (services) {
                    region.instances.forEach(function (instance) {
                        if (instance != region.instance) {
                            const jwt = njwt.create({ iss: "msa", sub: "sync" }, region.key);
                            jwt.setExpiration(new Date().getTime() + (1 * 60 * 1000)); // 1 min
                            instance.sync.headers.Authorization = "Bearer " + jwt.compact();
                            instance.sync.body = {
                                region: region.name,
                                services: services
                            }
                            instance.sync.execute();
                        }
                    });
                });

            } else if (region.isRemote) {

                // start polling
                const poll = function () {
                    if (me.region.instance.isMaster) {
                        try {

                            // contact each remote server
                            const promises = [];
                            region.instances.forEach(function (instance) {
                                const deferred = q.defer();
                                promises.push(deferred.promise);
                                const jwt = njwt.create({ iss: "msa", sub: "query" }, region.key);
                                jwt.setExpiration(new Date().getTime() + (1 * 60 * 1000)); // 1 min
                                instance.query.headers.Authorization = "Bearer " + jwt.compact();
                                instance.query.execute().then(function (result) {

                                    // log
                                    instance.isConnected = true;
                                    instance.isMaster = result.body.isMaster;
                                    console.log("querying (%s) for remote status succeeded (master? %s).", instance.name, result.body.isMaster);

                                    // raise a queried event for each service
                                    if (result.body.services) { // services are only delivered if the instance was the master
                                        result.body.services.forEach(function (service) {
                                            context.events.emit("remote.service:queried", {
                                                name: service.name,
                                                fqn: result.body.region + "." + service.name,
                                                isLocal: false,
                                                isRemote: true,
                                                priority: service.priority,
                                                state: service.state,
                                                report: service.report,
                                                properties: service.properties
                                            });
                                        });
                                    }
                                    deferred.resolve({ name: instance.name, success: true });

                                }, function (result) {
                                    instance.isConnected = false;
                                    console.log("querying (%s) for remote status failed.", instance.name);
                                    deferred.reject({ name: instance.name, success: false });
                                }).done();

                            });

                            // once all queries are done, make sure at least one could be contacted
                            q.allSettled(promises).then(function (results) {
                                const successful = results.find(function (result) { return result.state === "fulfilled" });
                                if (successful) {
                                    region.clearcounter = 0;
                                } else {
                                    region.clearcounter++;
                                }
                                if (region["clear-after"] > 0 && region.clearcounter > region["clear-after"]) {
                                    const cleared = context.services.reduce(function (list, service) {
                                        if (service.fqn.split(".")[0] == region.name) {
                                            service.clear();
                                            context.events.emit("remote.service:cleared");
                                            list.push(service.fqn);
                                        }
                                        return list;
                                    }, []);
                                    console.info("services in region (%s) were cleared because no remote instances could be contacted after the allowed %d attempts (%s).", region.name, region["clear-after"], cleared);
                                }
                            }).done();

                        } catch (ex) {
                            // this should never happen, but the catch is here just in case it does
                            throw new verror(ex, "10382: unhandled exception on region.query (%s).", region.name);
                        }
                    }
                    setTimeout(poll, region.poll);
                }
                setTimeout(poll, 50); // start polling immediately

            }
        });

    }

}