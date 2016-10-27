# Multi-Service Availability (MSA)

*This tool is under development, check back here to see progress.*

This tool will sit between one or more load balancers (think NGINX or Azure Load Balancer) and a set of
services to provide comprehensive health information about the solution as a whole, including how it is
running across multiple regions.

Most any load balancer can hit a specific HTTP service and get a health status for whether that service
is up or down. But what if that service needs to contact 