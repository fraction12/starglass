## Context

Starglass has crossed the first threshold: it is no longer a vague idea. The package now has a source-agnostic core runtime, normalized event envelopes, checkpointing, duplicate suppression, dispatch targets, working tests, and a truthful release surface.

That is enough for an early package release. It is not yet enough for the stronger claim that Starglass is production-ready for real watcher workloads.

The remaining work clusters around six related gaps:
- adapter-authoring DX is still too implicit
- checkpoint persistence is functional but lightly hardened
- there is only a one-shot poll API, not a proper long-lived watch loop
- runtime observability is too thin for debugging production behavior
- release quality depends on convention more than enforced discipline
- the chassis still lacks proof through a real external-style adapter workflow

This change should address those gaps as one coherent hardening pass without expanding Starglass into workflow orchestration, first-party integrations, or a cloud service.

Constraints:
- Starglass must remain source-agnostic.
- Starglass must remain a chassis, not a policy engine.
- Hardening must improve trust and ergonomics without dragging in a first-party source catalog.
- A v0 package can stay small, but it cannot be sloppy.

Stakeholders:
- adapter authors who need a clean contract and examples
- operators running long-lived watcher processes
- downstream runtimes that need visibility into suppressed events, dispatch failures, and checkpoint progress
- package consumers who need boring, truthful releases

## Goals / Non-Goals

**Goals:**
- Add a long-lived watcher runtime surface so consumers do not have to reinvent watch-loop orchestration around `poll()`.
- Improve checkpoint persistence semantics so state writes are safer and bad state is diagnosable.
- Add lifecycle observability hooks for polling, suppression, dispatch, and checkpoint progression.
- Make the adapter contract easier to use through documentation, examples, and one real external-style proof.
- Add release verification discipline that proves the tarball is importable and contains only intended production artifacts.

**Non-Goals:**
- Shipping any first-party source integration package.
- Adding workflow logic such as retries of external business actions, comments, notifications, or agent policy.
- Introducing a hosted control plane or multi-tenant runtime.
- Solving every storage backend now; file-backed hardening is enough for this pass.

## Decisions

### 1. Add a first-class long-lived watcher lifecycle
Starglass will add a long-lived watch runtime on top of the existing `poll()` mechanics.

Expected behavior:
- accept an observation target and source adapter
- run repeated poll cycles on a configured interval
- support explicit stop/shutdown
- expose lifecycle state and failures to the caller
- allow bounded retry/backoff after failed cycles without silently wedging

The existing one-shot `poll()` API remains for job-style usage and tests.

**Why:** the product promise is a watcher chassis. If every consumer has to hand-roll the watch loop, the chassis stops one layer too early.

**Alternatives considered:**
- Keep only `poll()`. Rejected because it pushes the most watcher-specific responsibility back onto every consumer.
- Add a giant scheduler framework. Rejected because the need is a narrow lifecycle loop, not a workflow engine.

### 2. Harden file-backed checkpoint persistence
The file checkpoint store will remain the default implementation, but it must get safer write and error semantics.

The store should:
- write atomically rather than partially replacing state in-place
- surface corrupted or unreadable state with explicit errors
- preserve target-scoped semantics and dedupe behavior
- stay replaceable behind the `CheckpointStore` interface

**Why:** early packages can be simple, but silently fragile state handling is not acceptable for production watcher loops.

**Alternatives considered:**
- Switch to SQLite immediately. Rejected because it is a bigger product decision than needed for this pass.
- Leave the JSON store as-is. Rejected because partial writes and opaque read failures make production usage brittle.

### 3. Expose runtime observability hooks instead of hidden internal behavior
Starglass will add explicit observability hooks or callbacks for meaningful lifecycle events.

Expected hook surfaces include:
- poll cycle started/completed
- candidate event emitted or suppressed
- dispatch succeeded or failed
- checkpoint advanced
- watcher loop errored, backed off, stopped, or resumed

The shape can be logger-friendly callbacks rather than a full metrics system.

**Why:** operators need to answer basic questions about what happened without reading code or instrumenting internals themselves.

**Alternatives considered:**
- Leave observability to userland wrappers. Rejected because the runtime knows the important transitions and should expose them directly.
- Build full telemetry infrastructure. Rejected because that is too heavy for the current stage.

### 4. Treat adapter authoring as a product surface
The adapter contract is not just a type signature. It is part of the product.

This change should define and document:
- how to choose subject identities
- how to derive stable event ids
- how to choose and advance provider cursors
- how meaningful-change filtering should be applied
- how much normalized payload detail belongs in events

Proof should come from one external-style example adapter or example package structure that uses the public core API without cheating through internal access.

**Why:** the real test of Starglass is whether someone can build an adapter quickly and correctly.

**Alternatives considered:**
- Rely on the README snippet alone. Rejected because it is not enough for production-facing developer experience.

### 5. Encode release verification as repeatable discipline
Release correctness should be enforced by scripts and CI rather than remembered manually.

This pass should include:
- clean builds before packaging
- a tarball smoke test in a temp project
- CI that runs test, check, build, pack, and import verification
- documentation for the release path and versioning expectations

**Why:** package trust erodes instantly when the published artifact lies about what it contains.

**Alternatives considered:**
- Keep ad hoc manual checks. Rejected because that rots immediately.

## Risks / Trade-offs

- **[Watch loop scope creep]** → Mitigation: keep lifecycle support narrow, focusing on interval control, shutdown, and failure/backoff behavior rather than scheduling frameworks.
- **[Overdesigning observability]** → Mitigation: start with hooks/callbacks and structured lifecycle events rather than metrics infrastructure.
- **[Hardening file persistence may still not satisfy every workload]** → Mitigation: keep the interface replaceable and document when a custom store is warranted.
- **[Example adapters could drift into a connector strategy]** → Mitigation: keep proofs in examples/docs or a separate example package shape, not as first-party source integrations in the core package.
- **[Release discipline becomes busywork]** → Mitigation: automate it in CI and scripts so humans do not have to remember the steps.

## Migration Plan

1. Add a long-lived watch-loop API that wraps the existing poll flow.
2. Harden the file checkpoint store with atomic writes and clearer state errors.
3. Add runtime observability hooks and cover them in tests.
4. Expand docs and examples around adapter authoring, including one external-style proof.
5. Add CI/release smoke checks for build, pack, and import validation.
6. Reassess whether the package is ready for a stronger production claim after the proof adapter and hardening land.

## Open Questions

- Should the watch loop expose an imperative controller, an async iterator, or both?
- How much backoff policy should be built in versus delegated to caller configuration?
- What is the smallest observability surface that still makes production debugging sane?
- Should the proof adapter live under `examples/`, a separate workspace package, or an external repository?
- At what point does file-backed checkpointing stop being enough and require a documented SQLite path?
