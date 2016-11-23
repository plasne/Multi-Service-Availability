# Use-Case: Services that have dependencies

Consider the most simple scenario of a 3-tiered web application which has one or more front-ends, one or more middle-tier application servers, and one or more database servers.




## Probing for health

### High availability of services
Typically, if you are running in a configuration whereby you have multiple instances of your services running in a HA configuration, then you only need to probe that "collection" of services, not the individual services. In other words, you might setup the health probe to query a load balancer in front of the services, so as long as a valid instances responds (ie. your load balancer is working and at least one instance is still operational), then your probe can get the information it needs.

There are some exceptions:
* If you have an HA database configuration whereby one of the nodes is writeable and the others aren't, you might want to report health for the writeable node separately.
* If you require a certain number of instances to be healthy, you might want to report health for each instance separately.
* If there are different characteristics for each instance, you might want to report health for each instance separately so you can consider those differences in your rules.

## Scope of a service
What constitutes a service is really up to you, but within MSA it is the smallest unit that have a state/properties and be reported on. If you had a service that was made up of smaller services, and so it made sense to use the rules engine in MSA to determine whether the whole thing was healthy, and maybe only cared to report on the total health, you could define smaller services that rolled into one. For example,

sample.services
'''json
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
'''

sample.rules
'''json
[
  {
    "name": "appIsUp",
    "if": 
  }
]
'''
