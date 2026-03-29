# ADR 005: Cursor-Based Pagination

## Status
Accepted

## Context
Need efficient pagination for ticket lists, logs, and customer lists that scales with large datasets.

## Decision
Use cursor-based pagination (`_id` as cursor) instead of offset-based (`skip/limit`).

## Consequences
- O(1) page fetch regardless of dataset size (vs O(n) for offset)
- Stable results when new items are inserted during pagination
- Slightly more complex client implementation (must track cursor)
- Natural fit with MongoDB's `_id` ordering
