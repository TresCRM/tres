# ADR 002: MongoDB for Multi-Tenant SaaS

## Status
Accepted

## Context
Need a database that supports flexible schemas, multi-tenant data isolation, and horizontal scaling.

## Decision
MongoDB with Mongoose ODM. Tenant isolation via `tenantId` field on every document with compound indexes.

## Consequences
- Flexible schema evolution without migrations
- Natural document model for tickets with embedded comments
- TTL indexes for automatic log cleanup
- No JOIN support (use application-level lookups)
- Must enforce tenantId scoping in every query
