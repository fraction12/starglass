## 1. Planning contract

- [ ] 1.1 Define a first-class observation-plan model with explicit strategy modes and fallback semantics.
- [ ] 1.2 Clarify where planning inputs live across target definitions, adapter capabilities, and persisted observation state.
- [ ] 1.3 Ensure plan reporting is honest on first fetch, degraded execution, and post-restart resume.

## 2. Runtime execution boundary

- [ ] 2.1 Separate plan selection from plan execution in the runtime surface.
- [ ] 2.2 Expose plan and fallback information through hooks and checkpoint metadata without bloating persisted state.

## 3. Verification

- [ ] 3.1 Add tests for plan selection order, fallback behavior, and resumed-plan behavior after restart.
- [ ] 3.2 Update docs to explain planning clearly for consumers and adapter authors.
