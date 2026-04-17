## Why

Starglass now has a credible watcher chassis, but it still stops one layer too early for the bigger product promise.

Today, a consumer can bring a source adapter and get polling, checkpointing, duplicate suppression, and dispatch. That is useful, but every downstream tool still has to decide how observation should happen, how to avoid wasteful checks, how to take advantage of push or conditional-fetch capabilities, and how to watch common external targets like APIs and websites without inventing bespoke runtime logic.

If Starglass is going to become the reusable observation substrate for CLI tools, it needs to grow from a solid poll loop into an adaptive observation runtime. The goal is not to promise magic or "no polling" in places where the source cannot support it. The goal is to make Starglass choose the cheapest credible observation strategy automatically and keep the necessary state compact and resumable.

## What Changes

- Add an observation-strategy layer that lets Starglass choose the best available watch mode for a target instead of assuming blunt fixed-interval polling.
- Add a generic HTTP observation family for website and API targets, including conditional requests, structured projections, and meaningful-change diffing.
- Extend checkpointed observation state so Starglass can resume efficient strategies using cursors, validators, and compact fingerprints rather than large raw snapshots.
- Add adaptive cadence controls so long-lived watchers can slow down, speed up, and back off based on activity, source hints, and failure conditions without external schedulers.
- Document the runtime boundary clearly: Starglass owns observation strategy and compact state, while consuming tools still own business meaning and downstream action policy.

## Capabilities

### New Capabilities
- `observation-strategy`: Resolve and run the cheapest credible observation strategy for a target based on adapter or target capabilities.
- `http-observation`: Watch generic HTTP JSON and HTML resources using transport-level primitives rather than provider-specific connectors.

### Modified Capabilities
- `source-observation`: Expand the source contract so adapters can expose observation capabilities and meaningful-change boundaries, not only a raw `poll()` implementation.
- `observation-checkpointing`: Persist compact strategy state that supports resumable conditional fetch, cursor continuation, and diff suppression without storing unnecessary full snapshots.

## Impact

- Affected code: runtime planning, target and adapter contracts, HTTP observation primitives, checkpoint persistence shape, docs, examples, and tests.
- Affected APIs: Starglass will gain strategy-aware observation surfaces and generic HTTP target support on top of the current watcher chassis.
- Dependencies or systems: no provider-specific source catalog is introduced; generic HTTP and strategy primitives stay inside the chassis boundary.
- Downstream systems: CLI tools should be able to watch websites and APIs with less bespoke runtime code and materially lower waste.