## Why

Starglass now has strategy-aware behavior, but too much of the planning logic is still implicit inside adapters and runtime internals.

For Starglass to become the observation substrate a CLI can trust, planning needs to be explicit and inspectable. A consumer should be able to ask what strategy the runtime chose, what it fell back from, and why. That matters for debugging, operator confidence, and keeping source families honest as Starglass grows beyond HTTP.

This change should pull planning into a first-class contract without turning it into an overdesigned framework.

## What Changes

- Introduce an explicit observation planning model that separates strategy selection from execution.
- Standardize planner outputs such as `push`, `conditional`, `cursor`, `probe-then-fetch`, `projection-diff`, and `snapshot-diff`.
- Make fallback behavior and chosen-plan reasoning observable to callers.
- Ensure source families can participate in planning without hiding important behavior inside adapter internals.

## Capabilities

### New Capabilities
- `observation-planning`: Resolve a concrete, inspectable plan for how a target will be observed before execution begins.

### Modified Capabilities
- `source-observation`: Allow adapters and targets to describe capabilities and planning-relevant constraints more explicitly.
- `runtime-observability`: Report chosen plans, fallback reasons, and degraded modes.

## Impact

- Affected code: capability contracts, runtime planner, hook payloads, docs, and tests.
- Affected APIs: callers gain a clearer way to inspect or reason about strategy choice and fallback behavior.
- Dependencies/systems: no provider catalog is introduced; this is about honest planning across generic source families.
- Downstream systems: CLIs and operators should gain much better visibility into how Starglass is deciding to watch a target.
