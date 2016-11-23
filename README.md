# Multi-Service Availability (MSA)

This tool will sit between one or more load balancers (think NGINX or Azure Load Balancer) and a set of
services to provide comprehensive health information about the solution as a whole, including how it is
running across multiple regions.

Most any load balancer can hit a specific HTTP service and get a health status for whether that service
is up or down. But what if that service has dependencies on other services, what if the service should
ideally only run in the region with a writeable database, etc. If you have those requirements then
you need some way to coordinate the understanding of health information as well as orchestration across
dozens or hundreds of services and multiple regions. MSA will attempt to solve this problem.

It will collect individual service availability and properties from your services running in its region,
run those through a rules engine to decide whether or not the service could be operational in its region.
It will collect the same data from other MSA engines running in other regions. It will then decide for
each service whether it should report that service as operational or not to the load balancer.

## Use-Cases
Click on each of these use-cases to see how to configure the application to support this scenario:

* [Services that have dependency on other services](/docs/dependencies.md)
* [Services that prefer to run with other services (ex. database)](/docs/colocation.md)
* [Services that have a maximum concurrency, such as cannot run more than once across all regions](/docs/colocation.md#limiting-concurrency)
* [Service health is based on information from other regions](/docs/based-on-remote.md)
* [Expose the most capable version of a service](/docs/most-capable.md)
* [Ensure traffic is routed to a healthy region](/docs/healthly-region.md)
* [Trigger failover of resources from one region to another](/docs/failover.md)
* [Prevent changing health status of flapping services](/docs/prevent-flapping.md)
* [Notify someone when services go down](/docs/notification.md)

## Configuration
* [Command Line Parameters](/docs/command-line.md)
* [config.regions](/docs/regions.md)
* [config.services](/docs/services.md)
* [config.rules](/docs/rules.md)
* [config.conditions](/docs/conditions.md)

## Features
* Easy to use rules engine
* High Availability within a region
* Comprehensive logging
* Status information available via HTML
* JWT authentication between MSA engines
* SSL support
* Instance discovery when using Docker Swarm
* Webhooks so actions can be initiated on state change (notification, DB failover, etc.)

## Future
* Messages from actions to show on the status page
* An priority can be specified for rules so the filenames don't determine order of processing
* Support for accepting messages from external services instead of polling
* Support for using JWT-based authentication to services with a renewal
* Extend the status page to allow for common actions such as a manual failover
* Root cause analysis - messaging on what component has probably failed by comparing probe data
