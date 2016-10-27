# Multi-Service Availability (MSA)

*This tool is under development, check back here to see progress.*

This tool will sit between one or more load balancers (think NGINX or Azure Load Balancer) and a set of
services to provide comprehensive health information about the solution as a whole, including how it is
running across multiple regions.

Most any load balancer can hit a specific HTTP service and get a health status for whether that service
is up or down. But what if that service has dependencies on other services, what if the service should
only be running no more than once across a number of regions, etc. If you have those requirements then
you need some way to coordinate the understanding of health information as well as orchestration across
dozens or hundreds of services and multiple regions. MSA will attempt to solve this problem.

It will collect individual service availability and properties from your services running in its region,
run those through a rules engine to decide whether or not the service could be operational in its region.
It will collect the same data from other MSA engines running in other regions. It will then decide for
each service whether it should report that service as operational or not to the load balancer.

## Use-Cases:
* Services that have dependency on other services
* Services that must run in the same region as other services (ex. a database)
* Services that have a maximum concurrency, such as cannot run more than once across all regions

## Planned Features:
* Easy to use rules engine
* High Availability within a region
* Comprehensive logging
* Status information available via REST endpoint
* Authentication between MSA engines
* Caching option to prevent "flapping" of services (up, down, down, up, up, down, etc.)
* Webhooks so actions can be initiated on state change (notification, DB failover, etc.)
* A region should have a minimum healthy state at which point it cedes control to another region

## Future Features:
* Support for using JWT-based authentication to services with a renewal
* Encryption between MSA engines
* Web site for viewing status information and support for common actions such as manual failover
* Root cause analysis - messaging on what component has probably failed by comparing probe data
* Service discovery when using Docker

## Development Notes:
* Separate a possible state (service is or is not operational) from the desired state (it reports
operational or not)
* Drop concurrency and instead have a status in the rules engine about whether this service is "desired"
to run or not.
* Regions should have properties too (such as whether it is primary)