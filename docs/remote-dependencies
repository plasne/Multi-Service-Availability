# Service health is based on information from other regions

For this scenario, you want to craft a rule that affects whether the local service reports as healthy or not based on information in other regions. This is simple enough to do (specify the region prefix to a service), however, the update actions can only affect local services, so you need to ensure this rule only runs in the specific region.

You can use the --config-prefix command line parameter to specify the config files that should be included for an instance of the MSA application. You still want to manage everything in your same source control system, so the files for all regions go in the same config folder, but you can specify different prefixes for different regions. You want to share as much as possible, so have a set of files that will load for both, but when you have deviating behavior, include those separately.

The sample below will show a service in the east region deferring to the west region (provided the west region is up).

east instance

```
node server.js --config-prefix config.,east.
```

west instance

```
node server.js --config-prefix config.,west.
```

config.rules
```json
[
  ...any shared rules...
]
```

east.rules

```json
[
  {
    "name": "east-defers-to-west",
    "if": "west-serviceA:up",
    "then": {
      "service": "serviceA",
      "report": "down"
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "west-serviceA:up",
    "eq": {
      "service": "west.serviceA",
      "state": "up"
    }
  }
]
```
