# Trigger failover of resources from one region to another

A very common scenario is to have a database configured for HA in each region and asynchronous replication between regions. Typically only one of those databases is the primary (writeable) instance. There are any number of rules that you might write to ensure the desired region is running the primary database.

## 2 regions with failover if a region is down

This configuration uses a separate rules file for an east region and a west region. This can be implemented using --config-prefix.

east instance

```
node server.js --config-prefix config.,east.
```

west instance

```
node server.js --config-prefix config.,west.
```

config.rules
```
[
  ...any shared rules...
]
```

east.rules

```json
[
  {
    "name": "db-failover-to-east",
    "if": "!west-db:up && &&db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db/failover"
      }
    }
  }
]
```

config.conditions

```json
[
  {
  }
]
```

## 3 regions with failover if a region is down

## 2 regions and primary database prefers one over the other

## Primary database in a specific region based on service properties

## Implementing failover for SQL Server
