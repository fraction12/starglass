## 1. Core runtime and type surface

- [x] 1.1 Define the normalized Starglass event envelope types and exported source/subject/event identifiers in `src/`.
- [x] 1.2 Define observation target, watch policy, dispatch target, source adapter, and checkpoint store interfaces in the public runtime surface.
- [x] 1.3 Add a thin runtime entrypoint for registering observation targets and running a poll cycle against a source adapter.

## 2. Checkpointing and dedupe

- [x] 2.1 Implement a file-backed checkpoint store interface for local persistence.
- [x] 2.2 Define checkpoint records keyed by observation target with provider cursor/high-water-mark support.
- [x] 2.3 Implement duplicate suppression using stable event ids and target-scoped checkpoint state.
- [x] 2.4 Add restart-safe checkpoint resume behavior so previously dispatched events are not replayed after process restart.

## 3. Source adapter model

- [x] 3.1 Define the source-adapter contract so users can supply target-specific configuration, polling logic, and normalized event emission.
- [x] 3.2 Keep source-specific fetching and interpretation outside the core runtime.
- [x] 3.3 Document and test the adapter contract without shipping built-in source integrations.
- [x] 3.4 Implement meaningful-change filtering so only configured event kinds are emitted.
- [x] 3.5 Derive stable event ids and provider cursors in user-supplied adapters.

## 4. Dispatch layer

- [x] 4.1 Define a dispatch adapter interface that accepts normalized Starglass events without downstream business logic.
- [x] 4.2 Implement command-oriented and/or in-process handler dispatch targets for machine-readable event delivery.
- [x] 4.3 Ensure checkpoint advancement happens only after successful dispatch or deterministic duplicate suppression.
- [x] 4.4 Surface dispatch failures clearly without silently dropping events.

## 5. Tests and developer ergonomics

- [x] 5.1 Add unit tests covering normalization and dispatch behavior through concrete adapter fixtures.
- [x] 5.2 Add tests for duplicate suppression and isolated checkpoints across multiple observed subjects.
- [x] 5.3 Add tests for restart resume behavior using the file-backed checkpoint store.
- [x] 5.4 Add tests for command-target and handler-target dispatch success and failure behavior.
- [x] 5.5 Update the README and OpenSpec artifacts so Starglass is clearly framed as a chassis for user-built adapters, with no built-in source implementations.
