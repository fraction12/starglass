## Why

Agents and CLI tools keep running into the same coordination gap: something important changes in an external system later, and a human has to notice it and manually pull the tool back into the loop.

That coordination gap shows up everywhere, but the product is the chassis for building reliable watcher-style systems against arbitrary sources.

Starglass should provide the runtime contract, not a growing catalog of official source packages. Users should be able to build their own adapters quickly and plug them into a stable observation, checkpointing, and dispatch loop.

## What Changes

- Add a source-agnostic observation chassis that lets consumers register their own source adapters and observation targets.
- Define a normalized Starglass event envelope instead of leaking raw source payloads downstream.
- Add checkpointing and dedupe so observed updates are resumable and are not dispatched repeatedly.
- Add dispatch primitives so downstream CLIs, handlers, or agent runtimes can receive normalized events and decide what to do.
- Keep the boundary hard: Starglass owns observation, normalization, checkpointing, and dispatch, while adapter authors own source-specific fetching and normalization.
- Keep source adapters entirely user-supplied rather than shipping any first-party source strategy.

## Capabilities

### New Capabilities
- `source-observation`: Observe arbitrary external systems through user-supplied source adapters.
- `event-dispatch`: Deliver normalized observation events to downstream handlers, commands, or runtimes using a stable envelope.
- `observation-checkpointing`: Track previously seen events so dispatch is resumable and duplicate updates are suppressed.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/` runtime surface, event types, source adapter interfaces, checkpoint storage, and dispatch interfaces.
- Affected APIs: the public Starglass package surface will expose a generic watcher chassis rather than a source-specific story.
- Dependencies/systems: Starglass exposes the chassis only and does not promise or ship a first-party source catalog.
- Downstream systems: agent runtimes and CLIs can consume dispatched events, but Starglass does not own their action logic.
