## 1. Bounded adaptive cadence core

- [x] 1.1 Define caller-facing cadence bounds and policy hints for watch loops.
- [x] 1.2 Use persisted observation metadata such as `Retry-After`, `Cache-Control: max-age`, recent activity, and idle streaks to choose the next watch delay.
- [x] 1.3 Preserve explicit failure backoff behavior without letting adaptive cadence become unpredictable.

## 2. Observability

- [x] 2.1 Emit structured cadence-change signals with reasons and next-attempt timing.
- [x] 2.2 Make cadence decisions inspectable without coupling Starglass to a logging backend.

## 3. Verification

- [x] 3.1 Add tests for slowdown, speed-up, hint-driven defer, and bounded recovery after failures.
- [x] 3.2 Update README and examples to show how callers bound and reason about adaptive cadence.
