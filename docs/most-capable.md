# Expose the most capable version of a service

This scenario might be used because you have a complex service with a lot of dependencies (A), a version of that service with fewer capabilities and less dependencies (B), and a barebones version of that service (C). You want to expose the most capable version possible, but failover to the others when that isn't possible.

Note a few things about the configuration below:

* "A-only" takes precedent and forces both B and C to report as down.

* "B-only" forces C down only if B is up and A is not. There is no need to force A to report down because it already will by its state being down.

* There is no need for a "C-only" rule because if the rule processing gets that far, A and B are already down and C will be up or down on the merit of its state.

* The update actions modify how the service reports, not its state. This is important because the state should reflect whether the service *could* be operational, whereas the report should reflect whether the service *should* be operational. If A, B, and C are all up, their states will all be up, but only A will report up.

config.rules

```json
[
  {
    "name": "A-only",
    "if": "serviceA:up",
    "then": [
      {
        "service": "serviceB",
        "report": "down"
      },
      {
        "service": "serviceC",
        "report": "down"
      }
    ]
  },
  {
    "name": "B-only",
    "if": "serviceB:up AND !serviceA:up",
    "then": {
        "service": "serviceC",
        "report": "down"
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "serviceA:up",
    "eq": {
      "service": "serviceA",
      "state": "up"
    }
  },
  {
    "name": "serviceB:up",
    "eq": {
      "service": "serviceB",
      "state": "up"
    }
  }
]
```
