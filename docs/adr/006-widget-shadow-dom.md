# ADR 006: Shadow DOM for Widget Isolation

## Status
Accepted

## Context
The embeddable widget must render inside any host website without CSS conflicts in either direction.

## Decision
Use native Shadow DOM (`attachShadow({ mode: 'open' })`) to encapsulate widget styles and DOM.

## Consequences
- Complete CSS isolation (host styles don't leak in, widget styles don't leak out)
- No external CSS framework dependency
- Keyboard/accessibility features work within shadow boundary
- Some older browsers may need polyfill (acceptable: target modern browsers)
- Slightly more complex event handling (events don't bubble out of shadow root by default)
