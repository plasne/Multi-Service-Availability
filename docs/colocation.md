# Services that prefer to run with other services

The scenario here is you have a service that could run in multiple regions but you *desire* it to run in the region alongside other services or it *must* run alongside other services.

To cover the *desire* scenario, we need to talk about service priority.

## How priority is calculated

The priority for a service is calculated by summing a list of priority values. There will be:

* a single priority value for the service (defined in the [config.services](/docs/services.md) file).
* a single priority value for the region (defined in the [config.regions](/doc/regions.md) file).
* potentially a single priority value for each rule (defined via update actions in the [config.rules](/doc/rules.md) file).

A common configuration might be for the primary region to have a priority of 2000 and a secondary region to have a priority of 1000 but the service priority in both to be defined as 100; thereby giving the primary region service a priority of 2100 and the secondary region service a priority of 1100.

Priority values for rules are cleared before each execution of the rule engine. This ensures the priority impact is limited to a single execution of rules and prevents a rule from applying its effects every time the rule processing is performed.

## Adjusting priority

You can adjust the priority using update [actions](/docs/actions.md). For instance, if you wanted to encourage a service to run in the same region as the writeable instance of a database, you might increase it's priority to a higher number than the other regions. Using the prior example, you might add 10000 to the service priority when the database was found in the same region as writeable; therefore if the secondary region had the primary database then the service would be a higher priority in the secondary region.

config.rules

```json
[
  {
    "name": "app-preferDbWrite",
    "if": "db:write",
    "then": {
      "service": "app",
      "priority": 10000
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "db:write",
    "eq": {
      "service": "db",
      "property": "write"
    }
  }
]
```

## Limiting concurrency

After using the above technique to control the priority, you can limit the number of regions that a service will be available in (normally limiting to one so the region that is preferred is the only region showing healthy).

Notice a few things about the following configuration:

* The at-most condition will sort all wfe services (across all regions) that are up by their priority (descending) and return true if the local wfe service is included in the top count. For this specific rule, it means that the only condition that will return true is the highest priority operational wfe service.

* The at-most condition must specify a state or array of states that will determine whether that region's service is considered in the calculation. This is important because you only want to bring down a region if there is a healthy region to handle the workload.

* There is no then clause for the rule, so it will force the wfe service down only if the above condition was found to be false. This lets you keep the existing state and report value undisturbed if the condition was true.

* Notice that the else clause changed the report value and not the state value. The state should reflect whether or not the service *could* be operational whereas the report should reflect whether or not the service *should* be operational. In this case, the choice of which region to operate in is a decision, not a representation of capability.

config.rules

```json
[
  {
    "name": "wfe-singleton",
    "if": "wfe:priority",
    "else": {
      "service": "wfe",
      "report": "down"
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "wfe:priority",
    "at-most": {
      "service": "wfe",
      "state": "up",
      "count": 1
    }
  }
]
```
