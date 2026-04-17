## 1. Planning contract

- [x] 1.1 Define a first-class observation-plan model with explicit strategy modes and fallback semantics.
- [x] 1.2 Clarify where planning inputs live across target definitions, adapter capabilities, and persisted observation state.
- [x] 1.3 Ensure plan reporting is honest on first fetch, degraded execution, and post-restart resume.

## 2. Runtime execution boundary

- [x] 2.1 Separate plan selection from plan execution in the runtime surface.
- [x] 2.2 Expose plan and fallback information through hooks and checkpoint metadata without bloating persisted state.

## 3. Verification

- [x] 3.1 Add tests for plan selection order, fallback behavior, and resumed-plan behavior after restart.
- [x] 3.2 Update docs to explain planning clearly for consumers and adapter authors.
