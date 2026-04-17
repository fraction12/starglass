## 1. Generic feed observation

- [x] 1.1 Add RSS/Atom observation targets and normalized entry projection support.
- [x] 1.2 Reuse shared strategy, checkpoint, and dedupe primitives rather than introducing a special runtime path.

## 2. Generic filesystem observation

- [x] 2.1 Add file and directory observation targets using normalized snapshot/projection diffing.
- [x] 2.2 Keep persisted state compact and avoid raw archive behavior by default.

## 3. Shared architecture proof

- [x] 3.1 Ensure feed and filesystem observation use the same generic planning and runtime boundaries established elsewhere.
- [x] 3.2 Add examples proving Starglass is growing by source families, not branded connectors.

## 4. Verification

- [x] 4.1 Add tests for feed entry changes, quiet feed cycles, filesystem churn suppression, restart-safe observation state, and revision-aware re-emits.
