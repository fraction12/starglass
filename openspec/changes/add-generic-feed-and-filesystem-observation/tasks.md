## 1. Generic feed observation

- [ ] 1.1 Add RSS/Atom observation targets and normalized entry projection support.
- [ ] 1.2 Reuse shared strategy, checkpoint, and dedupe primitives rather than introducing a special runtime path.

## 2. Generic filesystem observation

- [ ] 2.1 Add file and directory observation targets using normalized snapshot/projection diffing.
- [ ] 2.2 Keep persisted state compact and avoid raw archive behavior by default.

## 3. Shared architecture proof

- [ ] 3.1 Ensure feed and filesystem observation use the same generic planning and runtime boundaries established elsewhere.
- [ ] 3.2 Add examples proving Starglass is growing by source families, not branded connectors.

## 4. Verification

- [ ] 4.1 Add tests for feed entry changes, quiet feed cycles, filesystem churn suppression, and restart-safe observation state.
