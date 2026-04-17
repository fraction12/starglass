## 1. JSON projection ergonomics

- [x] 1.1 Add helpers for common JSON selection and normalization patterns.
- [x] 1.2 Ensure projected values are serialized deterministically for hashing and diffing.

## 2. HTML extraction ergonomics

- [x] 2.1 Define a minimal HTML extraction contract that stays generic and consumer-shaped.
- [x] 2.2 Avoid turning extraction into a selector framework or connector catalog.

## 3. Documentation and examples

- [x] 3.1 Add examples showing how to project only meaningful JSON fields and HTML regions.
- [x] 3.2 Clarify the boundary between projection authoring and downstream business policy.

## 4. Verification

- [x] 4.1 Add tests for deterministic normalization, equivalent-value hashing, and projection authoring edge cases.
