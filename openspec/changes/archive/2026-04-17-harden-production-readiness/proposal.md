## Why

Starglass now has a working source-agnostic core, but the remaining gap is trust.

For Starglass to be production-ready for its intended watcher-chassis role, consumers need more than a clean `poll()` API. They need a runtime that behaves predictably over long-lived watcher workloads, survives ugly checkpoint edge cases, exposes enough signals to debug failures, and gives adapter authors a clear path to building against the chassis without guesswork.

The next change should harden the runtime and the developer experience around it rather than widening scope into new source integrations or workflow logic.

## What Changes

- Add a long-lived watcher lifecycle on top of the existing poll-cycle runtime.
- Harden checkpoint persistence so file-backed state writes are safer and corrupted state is surfaced clearly.
- Add runtime observability hooks so consumers can inspect polling, suppression, dispatch, failure, and checkpoint advancement behavior.
- Document the adapter authoring contract with a concrete external-style example and release-proof guidance.
- Add release verification discipline so package artifacts are clean, importable, and reproducible.
- Prove the chassis with one real adapter-style example outside the core runtime surface.

## Capabilities

### New Capabilities
- `watcher-lifecycle`: Run long-lived watch loops with controlled polling, shutdown, and failure behavior.
- `runtime-observability`: Surface watcher lifecycle signals for logging, debugging, and runtime inspection.

### Modified Capabilities
- `observation-checkpointing`: Strengthen persistence guarantees and error surfacing around checkpoint state.
- `source-observation`: Improve adapter authoring ergonomics and proof that external adapters can be built cleanly.

## Impact

- Affected code: runtime loop, checkpoint store, package docs/examples, release scripts, and CI/release verification.
- Affected APIs: Starglass gains a long-lived watcher surface and observability hooks in addition to the one-shot poll flow.
- Dependencies/systems: no first-party source catalog is added; proof should come from an external-style adapter example instead.
- Downstream systems: adapter authors and runtime operators should gain clearer ergonomics and much better failure visibility.
