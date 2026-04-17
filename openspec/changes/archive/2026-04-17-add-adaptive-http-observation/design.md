## Context

Starglass v0 proves the chassis layer: a source-agnostic runtime, normalized events, duplicate suppression, file-backed checkpoints, long-lived watch loops, and dispatch boundaries. That is enough to package the runtime honestly, but it is not yet enough to make Starglass the observation substrate that downstream CLI tools can rely on for real external awareness.

The missing layer is observation strategy.

Right now, Starglass mostly assumes that consumers know how to observe efficiently and will encode that knowledge inside custom adapters. That means each downstream tool still has to reinvent decisions such as:
- whether a source can push instead of being polled
- whether a request can use `ETag` or `Last-Modified`
- whether a cheap probe can avoid a full fetch
- whether a JSON or HTML response should be normalized before diffing
- how to slow down quiet watchers and speed up active ones
- what compact state is needed to resume efficiently after restart

This change should move those concerns into Starglass without turning Starglass into a workflow engine, connector marketplace, or business-policy layer.

## Goals / Non-Goals

**Goals**
- Let Starglass choose the best available observation strategy for a target from declared capabilities.
- Add a first-class generic HTTP observation family for APIs and websites without introducing provider-specific connectors.
- Keep observation state compact and resumable through validators, cursors, and small fingerprints.
- Reduce fixed-interval waste through adaptive cadence and bounded backoff behavior.
- Preserve the current architecture boundary where Starglass notices change and the consuming tool decides what that change means.

**Non-Goals**
- Building a workflow engine, rules engine, or notification product inside Starglass.
- Shipping provider-specific first-party adapters for GitHub, Linear, Stripe, or similar systems.
- Storing arbitrary raw payload archives by default.
- Promising zero polling when the source does not support a cheaper push or conditional mode.
- Solving distributed watcher coordination or hosted multi-tenant execution in this pass.

## Decisions

### 1. Introduce strategy-aware observation planning
Starglass should grow a planning layer that resolves an observation strategy from target and adapter capabilities.

A source or target should be able to describe capabilities such as:
- `push`
- `cursor`
- `conditionalRequest`
- `cheapProbe`
- `projectionDiff`
- `snapshotDiff`

The runtime then chooses the best available mode instead of assuming a single hard-coded polling path.

Planned priority order:
1. push or subscription modes when available
2. conditional fetch using validators such as `ETag` or `Last-Modified`
3. cursor-based incremental fetch
4. cheap probe followed by targeted fetch when necessary
5. normalized snapshot or projection diff as the fallback

**Why:** the core product promise is not "poll forever." It is "maintain awareness cheaply and reliably." A planning layer is what lets Starglass make that promise honestly.

### 2. Add a generic HTTP observation family
Starglass should include a transport-level HTTP observation capability for JSON and HTML targets.

This is not a provider catalog. It is a generic source family for the most common external observation problem: watching a resource reachable over HTTP.

The HTTP family should support:
- JSON resource observation with field projection
- HTML resource observation with selector or extraction-based projection
- conditional requests with `ETag` and `Last-Modified`
- compact fingerprints of normalized projections
- source hints for cacheability and rate limiting

**Why:** APIs and websites are the obvious proving ground for Starglass as a reusable observation runtime. If Starglass cannot watch those elegantly, the thesis is weaker than it should be.

### 3. Extend checkpointing into compact observation state
Checkpointing should evolve from a narrow dispatched-event ledger into a compact observation state record.

The state should be able to include, when relevant:
- provider cursor
- HTTP validators such as `ETag` and `Last-Modified`
- last meaningful projection fingerprint
- last successful strategy selection
- last probe or fetch metadata
- dispatched event ids or a bounded dedupe ledger

The state should remain compact, portable, and inspectable. Starglass should not store whole response bodies or snapshots by default.

**Why:** efficient observation is mostly about carrying the right tiny facts across process restarts.

### 4. Add adaptive cadence
Watchers should not all run on the same fixed interval forever.

Starglass should let callers provide bounds and policy hints, then adapt cadence based on:
- recent activity
- source cache hints or retry hints
- repeated idle checks
- transient failures or rate limits
- explicit urgency or freshness settings from the consumer

This should remain a bounded runtime policy, not a general scheduler.

**Why:** most waste in watcher systems comes from checking quiet things too often and redoing expensive fetches unnecessarily.

### 5. Keep business meaning outside Starglass
Even as Starglass becomes smarter about observation, it must stop at change detection and dispatch.

The consuming CLI or agent tool should still decide:
- which fields matter to the product
- whether a change is important enough to notify on
- what downstream action to take
- whether to batch, alert, summarize, or ignore

**Why:** otherwise Starglass turns into a muddled automation platform rather than a sharp observation substrate.

## Proposed surface shape

The final API shape can evolve, but the design should support concepts like:
- strategy-capable adapters or target definitions
- a runtime strategy resolver
- compact observation state records
- generic HTTP target definitions for JSON and HTML resources
- normalized projection extractors
- cadence hints and adaptive watch policies

Illustrative concepts only:

```ts
interface ObservationCapabilities {
  push?: boolean
  cursor?: boolean
  conditionalRequest?: boolean
  cheapProbe?: boolean
  projectionDiff?: boolean
  snapshotDiff?: boolean
}

interface ObservationPlan {
  mode: 'push' | 'conditional' | 'cursor' | 'probe-then-fetch' | 'projection-diff' | 'snapshot-diff'
  cadence?: {
    minIntervalMs: number
    maxIntervalMs: number
    currentIntervalMs: number
  }
}
```

## Risks / Trade-offs

- **Strategy creep:** the planner could become an overdesigned framework. Mitigation: support a small ordered set of modes rather than an open-ended planning language.
- **HTTP support drifting into connector sprawl:** mitigation: keep the built-in family transport-level and generic, not branded per provider.
- **State bloat:** mitigation: persist compact validator and fingerprint state by default, never whole payload archives.
- **Adaptive cadence becoming unpredictable:** mitigation: make cadence policy observable and caller-bounded.
- **Boundary erosion:** mitigation: keep source-specific business logic and downstream action policy in the consuming tool.

## Migration Plan

1. Define the strategy capability contract and observation-plan model.
2. Extend checkpoint records or adjacent state records to carry compact strategy state.
3. Introduce generic HTTP observation targets for JSON and HTML resources.
4. Add projection and fingerprinting support for meaningful-change detection.
5. Add adaptive cadence and observability around strategy choice and interval changes.
6. Prove the design with one downstream-style website or API watcher example.

## Open Questions

- Should strategy capability declaration live on the adapter, the target, or both?
- How much of adaptive cadence should be automatic versus caller-configured?
- Should the dedupe ledger remain explicit event ids only, or allow bounded digest windows for high-volume targets?
- How opinionated should built-in HTML extraction be before it becomes a separate parsing layer?
- When should Starglass expose raw versus normalized HTTP metadata to downstream consumers?