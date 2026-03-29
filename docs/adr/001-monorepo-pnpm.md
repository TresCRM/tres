# ADR 001: pnpm Monorepo

## Status
Accepted

## Context
Need to share types, config, and UI components across API, web, and workers while maintaining independent deployability.

## Decision
Use pnpm workspaces with packages for shared code (types, widget, config, sdk, ui) and apps for deployable services (api, web, workers).

## Consequences
- Shared types ensure API/frontend type safety
- Single `pnpm install` for all packages
- Independent builds and deployments per app
- Requires careful dependency management
