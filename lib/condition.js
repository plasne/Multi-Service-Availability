
const verror = require("verror");
const fs = require("fs");
const q = require("q"); 

module.exports = {
    conditions: [],

    load: function(files) {
        const me = this;
        const wrapper = q.defer();
        const promises = [];

        // load
        var count = 0;
        files.forEach(function(file) {
            if (file.endsWith(".conditions")) {
                const deferred = q.defer();
                promises.push(deferred.promise);
                fs.readFile("./config/" + file, function(error, contents) {
                    if (!error) {
                        try {
                            const conditions = JSON.parse(contents);
                            conditions.forEach(function(condition) {
                                me.new(condition);
                            });
                            deferred.resolve();
                            console.info("loaded %s (%d files).", file, count);
                        } catch (ex) {
                            throw new verror(ex, "10400: conditions config file (%s) was not valid.", file);
                        }
                    } else {
                        throw new verror(error, "10401: conditions config file (%s) could not be read.", file);
                    }
                });
                count++;
            }
        });

        // consolidate
        q.all(promises).then(function(outer) {
            wrapper.resolve(me.conditions);
        });

        return wrapper.promise;
    },

    new: function(base) {
        const me = this;

        // validate condition name
        if (base.name == null) {
            throw new verror("10411: each condition must have a name.");
        }
        const condition_with_same_name = me.conditions.find(function(c) { return (c.name == base.name) });
        if (condition_with_same_name) {
            throw new verror("10412: condition name (%s) must be unique.", base.name);
        }
        if (base.name.indexOf(".") > -1) {
            throw new verror("10413: condition name (%s) cannot contain periods.", base.name);
        }

        // has exactly one eq, all, any, or formula
        var count = 0;
        if (base.eq) count++;
        if (base.all) count++;
        if (base.any) count++;
        if (base.formula) count++;
        if (base["at-most"]) count++;
        if (base["min-viable"]) count++;
        if (count != 1) {
            throw new verror("10421: condition (%s) must have exactly one eq, all, any, formula, at-most, or min-viable property.", base.name);
        }

        // validate eq (service + state, property, report)
        if (base.eq) {
            var eq_count = 0;
            if (base.eq.state) eq_count++;
            if (base.eq.property) eq_count++;
            if (base.eq.report) eq_count++;
            if (!base.eq.service) {
                throw new verror("10431: condition (%s) with eq comparison must specify the service.", base.name);
            } else if (base.eq.properties) {
                throw new verror("10432: condition (%s) with eq comparison may only specify a single property.", base.name);
            } else if (eq_count == 1) {

                // add the evaluation function
                base.evaluate = function(context) {
                    const fqn = (base.eq.service.indexOf(".") > -1) ? base.eq.service : context.region.name + "." + base.eq.service;
                    const service = context.services.find(function(s) { return (s.fqn == fqn) });
                    if (service) {
                        if (base.eq.state && service.state == base.eq.state) return true;
                        if (base.eq.property && service.properties.indexOf(base.eq.property) > -1) return true;
                        if (base.eq.report && service.report == base.eq.report) return true;
                    } else {
                        // 10434 should have detected this at startup, but if it somehow happens, let the condition fail but don't stop execution
                        console.error("10433: condition (%s) could not be evaluated because service (%s) could not be found.", base.name, base.eq.service);
                    }
                    return false;
                }

                // add a validation function which can catch bad service references early
                base.validate = function(context) {
                    const name = (base.eq.service.indexOf(".") > -1) ? base.eq.service.split(".")[1] : base.eq.service;
                    if (global.msa_settings.loglevel >= 4) console.log("condition (%s) precheck for 10434 will look for service fqn (%s).", base.name, fqn);
                    const service = context.services.find(function(s) { return (s.name == name) });
                    if (!service) {
                        throw new verror("10434: condition (%s) could not be evaluated because service (%s) could not be found.", base.name, base.eq.service);
                    }
                }

            } else {
                throw new verror("10435: condition (%s) with eq comparison must have exactly one of state, property, or report.", base.name);
            }
        }

        // validate all (service + properties)
        if (base.all) {
            if (!base.all.service) {
                throw new verror("10441: condition (%s) with all comparison must specify the service.", base.name);
            } else if (base.all.properties) {
                base.evaluate = function(context) {
                    // stub
                }
            } else {
                throw new verror("10442: condition (%s) with all comparison must specify properties.", base.name);
            }
        }

        // validate any (service + properties)
        if (base.any) {
            if (!base.any.service) {
                throw new verror("10451: condition (%s) with any comparison must specify the service.", base.name);
            } else if (base.any.properties) {
                base.evaluate = function(context) {
                    // stub
                }
            } else {
                throw new verror("10452: condition (%s) with any comparison must specify properties.", base.name);
            }
        }

        // validate formula
        if (base.formula) {
            base.evaluate = function(context) {
                // stub
            }
        }

        // validate at-most
        if (base["at-most"]) {
            if (!base["at-most"].service) {
                throw new verror("10461: condition (%s) with at-most comparison must specify the service.", base.name);
            } else if (base["at-most"].service.indexOf(".") > -1) {
                throw new verror("10462: condition (%s) with at-most comparison specified a service FQN (%s), but only a name is allowed.", base.name, base["at-most"].service);
            } else if (!base["at-most"].state && !Array.isArray(base["at-most"].states)) {
                throw new verror("10463: condition (%s) with at-most comparison must specify a state or states property.", base.name);
            } else if (isNaN(parseInt(base["at-most"].count))) {
                throw new verror("10464: condition (%s) with at-most comparison must specify a count as an integer.", base.name);
            } else {

                // make integer
                base["at-most"].count = parseInt(base["at-most"].count);

                // add the evaluation function
                base.evaluate = function(context) {

                    // create a list of all services (remote or local) and sort them with priority descending
                    const services = context.services
                        .filter(function(service) {
                            if (service.name != base["at-most"].service) return false;
                            if (base["at-most"].state) {
                                return (service.state == base["at-most"].state);
                            } else {
                                return (base["at-most"].states.indexOf(service.state) > -1); 
                            }
                        }).sort(function(a, b) { return b.priority - a.priority; });

                    // debug logging
                    if (global.msa_settings.loglevel >= 4) { 
                        console.log("at-most sorted the following: %s", services.map(function(service) { return service.fqn }));
                    }

                    // return true if the top count includes the local service
                    for (var i = 0; i < Math.min(services.length, base["at-most"].count); i++) {
                        console.info("service (%s) was found included in condition (%s) at-most %d.", services[i].fqn, base.name, base["at-most"].count);
                        if (services[i].isLocal) return true;
                    }

                    return false;
                }

                // add a validation function which can catch bad service references early
                base.validate = function(context) {
                    const service = context.services.find(function(s) { return (s.name == base["at-most"].service) });
                    if (!service) {
                        throw new verror("10465: condition (%s) could not be evaluated because service (%s) could not be found.", base.name, base["at-most"].service);
                    }
                }

            }
        }

        // validate min-viable
        if (base["min-viable"]) {
            if (base["min-viable"].services != null && !Array.isArray(base["min-viable"].services)) {
                throw new verror("10471: condition (%s) with min-viable comparison specified services, but if it does it must be an array.", base.name);
            } else if (!base["min-viable"].state && !Array.isArray(base["min-viable"].states)) {
                throw new verror("10472: condition (%s) with min-viable comparison must specify a state or states property.", base.name);
            } else if (isNaN(parseInt(base["min-viable"].count))) {
                throw new verror("10473: condition (%s) with min-viable comparison must specify a count as an integer.", base.name);
            } else {

                // make integer
                base["min-viable"].count = parseInt(base["min-viable"].count);

                // add the evaluation function
                base.evaluate = function(context) {

                    // if the region isn't viable see if there is at least one region that is better
                    const services_by_region = context.services.reduce(function(result, service) {
                        
                        // determine if the service is operational
                        var is_operational = false;
                        if (base["min-viable"].state) {
                            is_operational = (service.state == base["min-viable"].state);
                        } else {
                            is_operational = (base["min-viable"].states.indexOf(service.state) > -1); 
                        }

                        // determine if the service is to be included 
                        var include = true;
                        if (base["min-viable"].services && base["min-viable"].services.indexOf(service.name) < 0) include = false;

                        // organize by region and count of operational services
                        var increment = (is_operational && include) ? 1 : 0; 
                        const region = result.find(function(r) { return r.region == service.fqn.split(".")[0] });
                        if (region) {
                            region.count += increment;
                        } else {
                            result.push({ region: service.fqn.split(".")[0], count: increment });
                        }

                        return result;
                    }, []).sort(function(a, b) {
                        return b.count - a.count; // descending by count
                    });

                    // debug logging
                    if (global.msa_settings.loglevel >= 4) { 
                        console.log("min-viable found the following services operational by region: %s", JSON.stringify(services_by_region));
                    }

                    // return true if the min-viable found is >= count
                    const local = services_by_region.find(function(entry) { return entry.region == context.region.name });
                    if (local == null) throw new verror("10474: condition (%s) tried to determine the number of local services but couldn't.", base.name);
                    if (local.count >= base["min-viable"].count) {
                        console.info("services in region (%s) were found to be viable (%d were up out of %d required).", context.region.name, local.count, base["min-viable"].count);
                        return true;
                    }

                    // return false if at least one region is better equipped to handle the load
                    const best = services_by_region[0];
                    if (best.count > local.count) {
                        console.warn("services in region (%s) were found to be NOT viable (%d were up out of %d required); region (%s) has healthier services.", context.region.name, local.count, base["min-viable"].count, best.region);
                        return false;
                    }

                    // there isn't a better region to take the load
                    console.warn("services in region (%s) were found to be NOT viable (%d were up out of %d required); but there wasn't a better region to defer to.", context.region.name, local.count, base["min-viable"].count);
                    return true;

                }

                // add a validation function which can catch bad service references early
                base.validate = function(context) {
                    if (Array.isArray(base["min-viable"].services)) {
                        base["min-viable"].services.forEach(function(name) {
                            if (name.indexOf(".") > -1) {
                                throw new verror("10475: condition (%s) with min-viable comparison specified services, but included a FQN (%s) whereas only names are allowed.", base.name, name);
                            }
                            const service = context.services.find(function(s) { return s.name == name });
                            if (!service) {
                                throw new verror("10476: condition (%s) could not be evaluated because service (%s) could not be found.", base.name, name);
                            }
                        });
                    }
                }

            }
        }

        me.conditions.push(base);
        return base;
    },

    validate: function(context) {
        const me = this;
        me.conditions.forEach(function(condition) {
            condition.validate(context);
        });
    }

}