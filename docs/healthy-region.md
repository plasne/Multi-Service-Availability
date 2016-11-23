# Ensure traffic is routed to a healthy region

Most of the other scenarios deal with how healthy a service is, but this scenario deals with how healthy a region is. Consider if your services run in two or three regions that if a region was sufficiently compromised (had a large number of services down) you might want to take it out of rotation to ensure the users are routed to a more healthy region.

Note a few things about the below configuration:

* min-viable will return true if at least count of the specified services are up (2 out of 3 in this case).

* The services node for min-viable is optional, if you leave it off, then all services are considered. You might specify them because your services are a [composed of sub-services](/docs/dependencies.md#scope-of-a-service).

* The state node could be states and specify an array of states to consider healthy.

* If the minimum healthy services is not met, the else clause is run and the * for service specifies that all services should be changed to down.

**Important** Even if a region does not meet its min-viable requirement for healthy services, it will not return false from min-viable if there are no other regions that have a higher number of healthy services. Said another way, this rule will never force you to be less reliable.

config.rules

```json
[
  {
    "name": "min-viable",
    "if": "min-viable",
    "else": {
      "service": "*",
      "report": "down"
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "min-viable",
    "min-viable": {
      "services": [ "serviceA", "serviceB", "serviceC" ],
      "state": "up",
      "count": 2
    }
  }
]
```
