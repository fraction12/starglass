## 1. JSON projection ergonomics

- [ ] 1.1 Add helpers for common JSON selection and normalization patterns.
- [ ] 1.2 Ensure projected values are serialized deterministically for hashing and diffing.

## 2. HTML extraction ergonomics

- [ ] 2.1 Define a minimal HTML extraction contract that stays generic and consumer-shaped.
- [ ] 2.2 Avoid turning extraction into a selector framework or connector catalog.

## 3. Documentation and examples

- [ ] 3.1 Add examples showing how to project only meaningful JSON fields and HTML regions.
- [ ] 3.2 Clarify the boundary between projection authoring and downstream business policy.

## 4. Verification

- [ ] 4.1 Add tests for deterministic normalization, equivalent-value hashing, and projection authoring edge cases.
