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
It will collect the same data from other MSA engines running in other regions. It will then decide 

## Development Notes:
* drop concurrency and instead have a status in the rules engine about whether this service is "desired"
to run or not.