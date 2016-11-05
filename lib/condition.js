
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
                            console.info("loaded %s.", file);
                        } catch (ex) {
                            throw new verror(ex, "10400: conditions config file (%s) was not valid.", file);
                        }
                    } else {
                        throw new verror(error, "10401: conditions config file (%s) could not be read.", file);
                    }
                });
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
        if (count != 1) {
            throw new verror("10421: condition (%s) must have exactly one eq, all, any, or formula property.", base.name);
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
                    const fqn = (base.eq.service.indexOf(".") > -1) ? base.service : context.region.name + "." + base.eq.service;
                    const service = context.services.find(function(s) { return (s.fqn == fqn) });
                    if (service) {
                        if (base.eq.state && service.state == base.eq.state) return true;
                        if (base.eq.property && state.properties.indexOf(base.eq.property) > -1) return true;
                        if (base.eq.report && service.report == base.eq.report) return true;
                    } else {
                        // 10434 should have detected this at startup, but if it somehow happens, let the condition fail but don't stop execution
                        console.error("10433: condition (%s) could not be evaluated because service (%s) could not be found.", base.name, base.eq.service);
                    }
                    return false;
                }

                // add a validation function which can catch bad service references early
                base.validate = function(context) {
                    const fqn = (base.eq.service.indexOf(".") > -1) ? base.service : context.region.name + "." + base.eq.service;
                    if (global.msa_settings.loglevel >= 4) console.log("condition (%s) precheck for 10434 will look for service fqn (%s).", base.name, fqn);
                    const service = context.services.find(function(s) { return (s.fqn == fqn) });
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