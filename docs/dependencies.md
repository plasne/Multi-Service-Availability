# Use-Case: Services that have dependencies
This section will outline the most simple scenario of a 3-tiered web application which has one or more front-ends, one or more middle-tier application servers, and one or more database servers. However, using the rules engine you could express any complexity across any number of services.

Look for a number of things in the configuration:

* Notice that rather than probing each instance of each service, only one of the instances is being probed by going through a load balancer. This is common, but read more about why later on this page under the *High Availability* section.

* Notice that the app availability is checked before wfe. This is required because the wfe needs to know about the availability of the app to determine its own availability. Rules are processed in order.

* Notice that while we could change the state or the report value in the action portion (then or else), but we are changing the state. You should think of the difference this way, "state" is whether or not the service *could* run, while "report" is whether or not the service *should* run. Because these are dependencies, the wfe cannot function without the app and the app cannot function without the db, so "state" is the appropriate value to change.

config.services
```json
[
  {
    "name": "wfe",
    "in": {
      "query": {
        "uri": "http://loadbalancer/wfe/health"
      }
    },
    "out": {
      "results": [
        {
          "state": "up",
          "response": 200
        },
        {
          "response": 503
        }
      ]
    }
  },
  {
    "name": "app",
    "in": {
      "query": {
        "uri": "http://loadbalancer/app/health"
      }
    },
    "out": {
      "results": [
        {
          "state": "up",
          "response": 200
        },
        {
          "response": 503
        }
      ]
    }
  },
  {
    "name": "db",
    "in": {
      "query": {
        "uri": "http://loadbalancer/db/health"
      }
    },
    "out": {
      "results": [
        {
          "state": "up",
          "response": 200
        },
        {
          "response": 503
        }
      ]
    }
  }
]
```

config.rules
```json
[
  {
    "name": "app-dependencies",
    "if": "app:up AND db:up",
    "then": {
      "service": "app",
      "state": "up"
    },
    "else": {
      "service": "app",
      "state": "down"
    }
  },
  {
    "name": "wfe-dependencies",
    "if": "wfe:up AND app:up",
    "then": {
      "service": "wfe",
      "state": "up"
    },
    "else": {
      "service": "wfe",
      "state": "down"
    }
  }
]
```

config.conditions
```json
[
  {
    "name": "wfe:up",
    "eq": {
      "service": "wfe",
      "state": "up"
    }
  },
  {
    "name": "app:up",
    "eq": {
      "service": "app",
      "state": "up"
    }
  },
  {
    "name": "db:up",
    "eq": {
      "service": "db",
      "state": "up"
    }
  }  
]
```

## High availability of services
Typically, if you are running in a configuration whereby you have multiple instances of your services running in a HA configuration, then you only need to probe that "collection" of services, not the individual services. In other words, you might setup the health probe to query a load balancer in front of the services, so as long as a valid instances responds (ie. your load balancer is working and at least one instance is still operational), then your probe can get the information it needs.

There are some exceptions:

* If you have an HA database configuration whereby one of the nodes is writeable and the others aren't, you might want to report health for the writeable node separately.

* If you require a certain number of instances to be healthy, you might want to report health for each instance separately.

* If there are different characteristics for each instance, you might want to report health for each instance separately so you can consider those differences in your rules.

## Scope of a service
What constitutes a service is really up to you, but within MSA it is the smallest unit that have a state/properties and be reported on. If you had a service that was made up of smaller services, and so it made sense to use the rules engine in MSA to determine whether the whole thing was healthy, and maybe only cared to report on the total health, you could define smaller services that rolled into one.

For example, below you will see a configuration whereby the "app" service is composed of the "app-featureA" service and "app-featureB" service. The "app" service has a /report/app endpoint but doesn't probe, while the "features" both probe but don't expose an endpoint.

config.services
```json
[
  {
    "name": "app",
    "out": {
      "results": [
        {
          "state": "up",
          "response": 200
        },
        {
          "response": 503
        }
      ]
    }
  },
  {
    "name": "app-featureA",
    "in": {
      "query": {
        "uri": "http://app/featureA/health"
      },
      "results": [
        {
          "response": 200,
          "state": "up"
        },
        {
          "state": "down"
        }
      ]
    }
  },
  {
    "name": "app-featureB",
    "in": {
      "query": {
        "uri": "http://app/featureB/health"
      },
      "results": [
        {
          "response": 200,
          "state": "up"
        },
        {
          "state": "down"
        }
      ]
    }
  }
]
```

config.rules
```json
[
  {
    "name": "app:up",
    "if": "app-featureA:up AND app-featureB:up",
    "then": {
      "service": "app",
      "state": "up"
    },
    "else": {
      "service": "app",
      "state": "down"
    }
  }
]
```

config.conditions
```json
[
  {
    "name": "app-featureA:up",
    "eq": {
      "service": "app-featureA",
      "state": "up"
    }
  },
  {
    "name": "app-featureB:up",
    "eq": {
      "service": "app-featureB",
      "state": "up"
    }
  }  
]
```

## References
For more information, read up on constructing these configuration files:

* [config.services](/docs/services.md)
* [config.rules](/docs/rules.md)
* [config.conditions](/docs/conditions.md)
