# ADR 003: NATS for Event Bus

## Status
Accepted

## Context
Need async event delivery for email notifications, webhook dispatch, and worker job triggering.

## Decision
NATS as lightweight message broker. Dual-layer: local EventEmitter for in-process events + NATS for distributed.

## Consequences
- Simple protocol, low latency, easy Docker setup
- No persistent message guarantee without JetStream (acceptable for MVP)
- Workers subscribe to `ticket.events` subject
- WebSocket broadcast piggybacks on same events
