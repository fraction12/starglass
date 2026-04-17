## Why

Starglass can now capture cadence-relevant HTTP hints, but it still does not actually behave like an adaptive observer.

Today, watchers can poll, back off on failure, and persist compact state. That is a credible runtime base, but it is not yet the thing downstream CLI tools need when they want to watch many targets cheaply and continuously. The missing step is to turn cadence hints and recent activity into bounded scheduling decisions inside the watch runtime itself.

This change should make Starglass actually use the observation metadata it already knows, while keeping scheduling simple, inspectable, and caller-bounded.

## What Changes

- Activate bounded adaptive cadence inside long-lived watch loops.
- Let runtime cadence respond to recent activity, idle streaks, `Retry-After`, and cache freshness hints.
- Expose cadence decisions and reasons through runtime hooks so consumers can inspect why Starglass sped up, slowed down, or waited.
- Keep cadence policy within caller-supplied bounds so Starglass remains a runtime substrate rather than a scheduler product.

## Capabilities

### New Capabilities
- `adaptive-cadence`: Adjust watch timing within caller-defined bounds using generic observation hints and recent runtime behavior.

### Modified Capabilities
- `watcher-lifecycle`: Evolve the current watch loop from fixed-interval polling with failure backoff into bounded adaptive observation.
- `runtime-observability`: Surface cadence changes, defer reasons, and next-attempt planning.

## Impact

- Affected code: watch-loop timing, HTTP hint consumption, observation-state use, runtime hooks, and tests.
- Affected APIs: watch configuration gains bounded cadence controls and observability around next-attempt timing.
- Dependencies/systems: no provider-specific scheduling logic is introduced; only generic hint consumption is added.
- Downstream systems: CLIs should be able to run more watchers with less waste and better freshness/cost tradeoffs.
