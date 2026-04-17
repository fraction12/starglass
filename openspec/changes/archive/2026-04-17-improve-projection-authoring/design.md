## Design

Projection authoring should feel like defining stable observed state, not like rebuilding parsing glue for every target.

This change keeps projection ergonomics deliberately small and transport-level:

- `projectJson.pick`, `projectJson.path`, and `projectJson.shape` handle common JSON selection patterns
- `normalize.projection` and `normalize.stable` make equivalent observed values serialize consistently
- `html.extract(projectFn)` wraps HTML extraction in a narrow contract that stays consumer-shaped

### Key decisions

1. **Helpers stay composable and narrow**
   - Starglass provides small helpers for common observation authoring patterns.
   - It does not become a query language, selector framework, or connector DSL.

2. **Deterministic normalization is part of the contract**
   - Observed projections are normalized before hashing and diffing.
   - Equivalent projected values should produce the same stable fingerprint.

3. **HTML extraction remains transport-level**
   - HTML support exists to define meaningful observed state from fetched documents.
   - Business meaning stays downstream.

4. **Wrapped extraction results are normalized explicitly**
   - The runtime uses shared helpers so wrapped `{ projection }` style results do not rely on loose duck-typing.

### Boundaries

- No policy engine for deciding what changes matter to the business.
- No large parser or selector ecosystem.
- No provider-specific extraction helpers.

The result is a small authoring surface that makes meaningful-change observation easier without changing Starglass into a workflow or scraping framework.