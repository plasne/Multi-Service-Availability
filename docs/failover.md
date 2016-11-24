# Trigger failover of resources from one region to another

A very common scenario is to have a database configured for HA in each region and asynchronous replication between regions. Typically only one of those databases is the primary (writeable) instance. There are any number of rules that you might write to ensure the desired region is running the primary database.

## Multiple rule files

Because actions are always only performed ..... These samples each use a shared rules file and separate (by region) rules files. This can be implemented using --config-prefix as shown. Keep as much in the shared file as possible, but sometimes there is a need to have specific rules.

## Pausing before actions

Transient network connectivity failures can happen that could cause your database to show down but could be resolved within seconds. Given that a database failover is a relatively complex operation, it is generally better to wait some amount of time before initiating the failover, and then only initiate if the failure condition is still true. To accomplish this, all of these samples use the pause action and the perform-only-if-unchanged directive.

## Implementing webhooks

The database failover mechanic uses webhooks, which means you will write your database failover logic and host that as a REST/JSON service somewhere. There is no logic in MSA to handle success or failover of the webhook (though it will log the failures). While there is no retry logic, if the condition that fired the webhook still exists the next time the rules engine executes, it will fire the webhook again.

Due to the conditions above, it is very important that your webhook handle certain conditions:

* You should make no assumptions about the current condition of the database, while the rule fired to failover it is possible that a prior execution of your webhook already had the failover in progress.

* The rules engine could run again at any point, so your webhook must be able to handle being called while the operation is still in progress.

* Your webhook should probably notify someone if it failed, otherwise the failover may never happen.

## 2 regions with failover if a region is down

The configuration below lets the east region failover the database to the east if the west database is down for 20 seconds (and the same for the west taking control from the east).

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
    "if": "!west-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-east/failover"
      }
    }
  }
]
```

west.rules

```json
[
  {
    "name": "db-failover-to-west",
    "if": "!east-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-west/failover"
      }
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "east-db:up",
    "eq": {
      "service": "east.db",
      "state": "up"
    }
  },
  {
    "name": "west-db:up",
    "eq": {
      "service": "west.db",
      "state": "up"
    }
  },
  {
    "name": "db:up",
    "eq": {
      "service": "db",
      "state": "up"
    }
  },
  {
    "name": "db:write",
    "eq": {
      "service": "db",
      "property": "write"
    }
  }
]
```

## 3 regions with failover if a region is down

The configuration below lets the east region failover the database to the east if the west and central database is down for 20 seconds (and the same for the west and central regions taking control).

Notice a few things about this configuration:

* This configuration uses both a shared and separate (by region) rules files. This can be implemented using --config-prefix as shown. Keep as much in the shared file as possible, but sometimes there is a need to have specific rules.

* The failover is performed via a webhook action. It is not called immediately though, the pause (20 sec) action happens first and then the webbhook action is only performed if the rule still evaluates the same.

east instance

```
node server.js --config-prefix config.,east.
```

west instance

```
node server.js --config-prefix config.,west.
```

central instance

```
node server.js --config-prefix config.,central.
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
    "if": "!west-db:up && !central-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-east/failover"
      }
    }
  }
]
```

west.rules

```json
[
  {
    "name": "db-failover-to-west",
    "if": "!east-db:up && !central-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-west/failover"
      }
    }
  }
]
```

central.rules

```json
[
  {
    "name": "db-failover-to-central",
    "if": "!east-db:up && !west-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-central/failover"
      }
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "east-db:up",
    "eq": {
      "service": "east.db",
      "state": "up"
    }
  },
  {
    "name": "west-db:up",
    "eq": {
      "service": "west.db",
      "state": "up"
    }
  },
  {
    "name": "central-db:up",
    "eq": {
      "service": "central.db",
      "state": "up"
    }
  },
  {
    "name": "db:up",
    "eq": {
      "service": "db",
      "state": "up"
    }
  },
  {
    "name": "db:write",
    "eq": {
      "service": "db",
      "property": "write"
    }
  }
]
```

## 2 regions and primary database prefers one over the other

The configuration below forces the database to be primary in the east region unless the database in that region is down in which case the west will try and become primary.

Notice a few things about this configuration:

* This configuration uses both a shared and separate (by region) rules files. This can be implemented using --config-prefix as shown. Keep as much in the shared file as possible, but sometimes there is a need to have specific rules.

* The failover is performed via a webhook action. It is not called immediately though, the pause (20 sec) action happens first and then the webbhook action is only performed if the rule still evaluates the same.

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
    "if": "!west-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-east/failover"
      }
    }
  }
]
```

west.rules

```json
[
  {
    "name": "db-failover-to-west",
    "if": "!east-db:up && db:up && !db:write",
    "then": {
      "pause": 20000,
      "perform-only-if-unchanged": true,
      "action": {
        "method": "POST",
        "uri": "http://db-west/failover"
      }
    }
  }
]
```

config.conditions

```json
[
  {
    "name": "east-db:up",
    "eq": {
      "service": "east.db",
      "state": "up"
    }
  },
  {
    "name": "west-db:up",
    "eq": {
      "service": "west.db",
      "state": "up"
    }
  },
  {
    "name": "db:up",
    "eq": {
      "service": "db",
      "state": "up"
    }
  },
  {
    "name": "db:write",
    "eq": {
      "service": "db",
      "property": "write"
    }
  }
]
```

## Primary database in a specific region based on service properties

## Implementing failover for SQL Server
