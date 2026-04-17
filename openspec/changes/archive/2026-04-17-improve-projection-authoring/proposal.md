## Why

Starglass can now compare normalized projections, but authoring those projections is still more bespoke than it should be.

If the product thesis is that a CLI should be able to watch whatever it needs, then defining “what matters” cannot feel like rewriting parsing glue every time. Projection authoring should be simple, deterministic, and obviously separate from business policy. Right now the boundary is conceptually correct, but the ergonomics are not yet there.

This change should make projection and extraction authoring feel like a first-class Starglass capability rather than an awkward side effect of adapter code.

## What Changes

- Add clean projection helpers for common JSON observation patterns.
- Add deterministic normalization utilities so semantically equivalent observed values hash and diff consistently.
- Introduce a minimal HTML extraction contract that stays generic and transport-level.
- Improve documentation and examples so consumers can define meaningful observation projections without bespoke runtime glue.

## Capabilities

### New Capabilities
- `projection-authoring`: Help consumers define stable, meaningful observation projections over JSON and HTML targets.

### Modified Capabilities
- `http-observation`: Improve the ergonomics and consistency of JSON and HTML meaningful-change detection.
- `source-observation`: Clarify that projection definition belongs at the observation boundary, while business meaning remains downstream.

## Impact

- Affected code: projection helpers, normalization utilities, HTML extraction contracts, docs, examples, and tests.
- Affected APIs: consumers gain simpler and more consistent ways to define observed state.
- Dependencies/systems: no branded connectors are introduced; this remains a generic observation-authoring layer.
- Downstream systems: CLIs should need less custom code to say what part of a resource actually matters.
