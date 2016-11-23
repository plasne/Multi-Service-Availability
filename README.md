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

## Use-Cases:
Click on each of these use-cases to see how to configure the application to support this scenario:

* [Services that have dependency on other services](/docs/dependencies.md)
* [Services that prefer to run or must run in the same region as other services (ex. a database)](/docs/colocation.md)
* Services that have a maximum concurrency, such as cannot run more than once across all regions
* To trigger failover of resources from one region to another
* Ensure traffic is routed to a region with the greatest number of healthy services

## Features:
* Easy to use rules engine
* High Availability within a region
* Comprehensive logging
* Status information available via HTML
* JWT authentication between MSA engines
* SSL support
* Instance discovery when using Docker Swarm
* Option to prevent "flapping" of services (up, down, down, up, up, down, etc.)
* Option to pause a change for a period of time and optionally check if the condition is still true
* Webhooks so actions can be initiated on state change (notification, DB failover, etc.)
* Regions can specify a minimally viable number of services before, after which it will attempt to cede to another region

## Future:
* Messages from actions to show on the status page
* Support for accepting messages from external services instead of polling
* Support for using JWT-based authentication to services with a renewal
* Extend the status page to allow for common actions such as a manual failover
* Root cause analysis - messaging on what component has probably failed by comparing probe data
