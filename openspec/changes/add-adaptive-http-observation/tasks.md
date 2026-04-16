## 1. Observation strategy core

- [ ] 1.1 Define the capability contract that lets targets or adapters declare available observation modes and cost hints.
- [ ] 1.2 Add a runtime planning layer that selects the cheapest credible observation strategy for a target.
- [ ] 1.3 Add tests covering strategy selection order, fallback behavior, and observability around selected plans.

## 2. Generic HTTP observation

- [ ] 2.1 Add generic HTTP observation targets for JSON and HTML resources without introducing provider-specific connectors.
- [ ] 2.2 Support conditional request validators such as `ETag` and `Last-Modified` where the source provides them.
- [ ] 2.3 Support normalized projection extraction and meaningful-change diffing for JSON fields and HTML selectors.
- [ ] 2.4 Add tests covering unchanged responses, validator-driven fetch suppression, and normalized diff behavior.

## 3. Compact observation state

- [ ] 3.1 Extend persisted observation state to carry compact strategy metadata such as cursors, validators, and projection fingerprints.
- [ ] 3.2 Keep persisted state inspectable and bounded without storing full raw payloads by default.
- [ ] 3.3 Add tests covering restart-resume behavior for conditional fetch and projection-diff workflows.

## 4. Adaptive cadence

- [ ] 4.1 Add bounded adaptive cadence controls for quiet targets, active targets, transient failures, and rate-limit style hints.
- [ ] 4.2 Expose observability signals for strategy choice, cadence changes, and degraded or fallback modes.
- [ ] 4.3 Add tests covering bounded acceleration, slowdown, and backoff behavior.

## 5. Documentation and proof

- [ ] 5.1 Update README and adapter-authoring guidance to describe strategy-aware observation and the Starglass boundary clearly.
- [ ] 5.2 Add at least one downstream-style example that watches a website or API using the new generic HTTP observation family.
- [ ] 5.3 Validate the change with `openspec validate add-adaptive-http-observation` and keep the artifact set ready for implementation.