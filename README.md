# Multi-Service Availability (MSA)

This tool will sit between one or more load balancers (think NGINX or Azure Load Balancer) and a set of services to provide comprehensive health information about the solution as a whole, including how it is running across multiple regions.

Most any load balancer can hit a specific HTTP service and get a health status for whether that service is up or down. But what if that service has dependencies on other services, what if the service should ideally only run in the region with a writeable database, etc. If you have those requirements then you need some way to coordinate the understanding of health information as well as orchestration across dozens or hundreds of services and multiple regions. MSA will attempt to solve this problem.

It will collect individual service availability and properties from your services running in its region, run those through a rules engine to decide whether or not the service could be operational in its region. It will collect the same data from other MSA engines running in other regions. It will then decide for each service whether it should report that service as operational or not to the load balancer.

It is a good idea to take a look at the [Architecture](/docs/architecture.md) to understand where this tools sits in your application design. Then read through a few of the use-cases below to see if you have any of the scenarios this tool can help with.

## Value proposition

When you have a lot of services running across multiple regions there is a lot of communication that must be done to understand whether your services are healthy and there is a lot of coordination that must be done to provide a good user experience when they are not. This service can help you with that communication and coordination.

When you use a microservices architecture, you will have lots of dependencies between services.

## Features

* Probes individual service health
* Easy to use rules engine
* High Availability within a region
* Comprehensive logging
* Status information available via HTML
* JWT authentication between MSA engines
* SSL support
* Instance discovery when using Docker Swarm
* Webhooks so actions can be initiated on state change (notification, DB failover, etc.)

## Use-cases

Click on each of these use-cases to understand the scenario and how MSA can help. If it looks like something that can be of value, you should read the *configuration* section below to understand how configuration works. Then you can come back to this section to see how to configure MSA to support each of these.

* [Services that have dependency on other services](/docs/dependencies.md)
* [Services that prefer to run with other services (ex. database)](/docs/colocation.md)
* [Services that have a maximum concurrency, such as cannot run more than once across all regions](/docs/colocation.md#limiting-concurrency)
* [Service health is based on information from other regions](/docs/based-on-remote.md)
* [Expose the most capable version of a service](/docs/most-capable.md)
* [Ensure traffic is routed to a healthy region](/docs/healthy-region.md)
* [Trigger failover of resources from one region to another](/docs/failover.md)
* [Prevent changing health status of flapping services](/docs/prevent-flapping.md)
* [Notify someone when services go down](/docs/notification.md)

## Configuration (coming soon)

* [Concepts](/docs/concepts.md)
* [Command Line Parameters](/docs/command-line.md)
* [config.regions](/docs/regions.md)
* [config.services](/docs/services.md)
* [config.rules](/docs/rules.md)
* [config.conditions](/docs/conditions.md)

## Implementation (coming soon)

* [Architecture](/docs/architecture.md)
* [Azure Load Balancer](/docs/azure-lb.md)
* [Azure Traffic Manager](/docs/azure-tm.md)
* [NGINX](/docs/nginx.md)
* [HAProxy](/docs/haproxy.md)
* [Docker Swarm](/docs/swarm.md)

the case for separating the health endpoint from the service endpoint
* separate scope for access (internal/external, ip restrictions, etc.)
* dependencies, concurrency, etc.
* workflow even if servers are down

## Future

* Finish documentation
* Build a configuration tool
* Implement versioning of instances - this way when you change configuration on an instance and re-introduce it to the region, the highest version can become the master and immediately introduce the changes
* Support for K8 in the same way as Swarm
* Messages from actions to show on the status page
* Support for rule priority so groups of them are not just processed based on filename
* Support for accepting messages from external services instead of polling
* Support for using JWT-based authentication to services with a renewal
* Extend the status page to allow for common actions such as a manual failover
* Root cause analysis - messaging on what component has probably failed by comparing probe data
