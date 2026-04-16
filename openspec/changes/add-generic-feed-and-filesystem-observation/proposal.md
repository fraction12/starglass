## Why

HTTP proves the direction, but Starglass only becomes the observation substrate if the architecture generalizes cleanly beyond HTTP.

The next source families should be generic, common, and structurally honest. RSS/Atom feeds and filesystem observation are good proving grounds because they are widely useful, obviously source-agnostic, and force shared planning, state, and diffing primitives to stay generic. If Starglass reaches for branded provider connectors too early, it will become a connector zoo instead of a reusable observation library.

This change should prove that Starglass can add new source families without bending the architecture or collapsing its boundaries.

## What Changes

- Add a generic feed observation family for RSS and Atom resources.
- Add a generic filesystem observation family for files or directories using stable observed projections rather than raw churn.
- Reuse shared planning, checkpoint, dedupe, and projection primitives across these families.
- Document the shared pattern so future source families stay generic rather than provider-branded.

## Capabilities

### New Capabilities
- `feed-observation`: Observe generic RSS and Atom feeds with normalized entry-aware change detection.
- `filesystem-observation`: Observe files or directories with normalized snapshot/projection change detection.

### Modified Capabilities
- `source-observation`: Prove the runtime can grow across multiple generic source families without first-party provider coupling.
- `observation-planning`: Reuse shared planning primitives beyond HTTP.

## Impact

- Affected code: new generic source-family adapters, shared state/planning reuse, docs, examples, and tests.
- Affected APIs: consumers gain additional source-agnostic observation families built into Starglass.
- Dependencies/systems: parser choices should stay minimal and generic; no branded provider integrations are introduced.
- Downstream systems: CLIs gain broader observation coverage without having to build every common watcher family from scratch.
