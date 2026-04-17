## 1. Observation strategy core

- [x] 1.1 Define the capability contract that lets targets or adapters declare available observation modes and cost hints.
- [x] 1.2 Add a runtime planning layer that selects the cheapest credible observation strategy for a target.
- [x] 1.3 Add tests covering strategy selection order, fallback behavior, and observability around selected plans.

## 2. Generic HTTP observation

- [x] 2.1 Add generic HTTP observation targets for JSON and HTML resources without introducing provider-specific connectors.
- [x] 2.2 Support conditional request validators such as `ETag` and `Last-Modified` where the source provides them.
- [x] 2.3 Support normalized projection extraction and meaningful-change diffing for JSON fields and HTML selectors.
- [x] 2.4 Add tests covering unchanged responses, validator-driven fetch suppression, and normalized diff behavior.

## 3. Compact observation state

- [x] 3.1 Extend persisted observation state to carry compact strategy metadata such as cursors, validators, and projection fingerprints.
- [x] 3.2 Keep persisted state inspectable and bounded without storing full raw payloads by default.
- [x] 3.3 Add tests covering restart-resume behavior for conditional fetch and projection-diff workflows.

## 4. Adaptive cadence

- [x] 4.1 Add bounded adaptive cadence controls for quiet targets, active targets, transient failures, and rate-limit style hints.
- [x] 4.2 Expose observability signals for strategy choice, cadence changes, and degraded or fallback modes.
- [x] 4.3 Add tests covering bounded acceleration, slowdown, and backoff behavior.

## 5. Documentation and proof

- [x] 5.1 Update README and adapter-authoring guidance to describe strategy-aware observation and the Starglass boundary clearly.
- [x] 5.2 Add at least one downstream-style example that watches a website or API using the new generic HTTP observation family.
- [x] 5.3 Validate the change with `openspec validate add-adaptive-http-observation` and keep the artifact set ready for implementation.
