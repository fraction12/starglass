# Starglass

Starglass is a source-agnostic watcher chassis for agents and CLI tools.

It gives you the boring but essential machinery for watcher-style systems:
- observation runtime
- normalized event envelopes
- checkpointing
- duplicate suppression
- dispatch to commands or in-process handlers
- strategy-aware observation planning for generic transports like HTTP

You bring the source adapter, or use a generic transport primitive.

That can be Linear, RSS, a private API, a queue, a database row, a website, or some cursed internal thing only your team understands. Starglass should not care.

## Boundary

Starglass owns:
- watcher lifecycle
- poll-cycle execution
- normalized event contracts
- compact checkpointing and dedupe
- observation strategy selection
- generic HTTP observation primitives
- dispatch primitives

Starglass does not own:
- a first-party source catalog
- provider-specific business logic
- workflow orchestration
- deciding what an agent should do next
- mutating external systems

## Mental model

1. Define an observation target.
2. Implement a `SourceAdapter` that can poll that target and emit normalized events, or use the built-in `HttpObservationAdapter`.
3. Run the `ObservationRuntime`.
4. Handle the resulting event envelope downstream.

## Minimal usage

```ts
import {
  CommandDispatchAdapter,
  FileCheckpointStore,
  ObservationRuntime,
  type CheckpointRecord,
  type ObservationEvent,
  type ObservationTarget,
  type SourceAdapter,
} from 'starglass'

type BuildTarget = ObservationTarget & {
  source: 'buildkite'
  pipeline: string
}

class BuildkiteSourceAdapter implements SourceAdapter<BuildTarget> {
  readonly source = 'buildkite'

  async poll(target: BuildTarget, checkpoint?: CheckpointRecord) {
    const events: ObservationEvent[] = []

    return {
      events,
      providerCursor: checkpoint?.providerCursor,
      polledAt: new Date().toISOString(),
    }
  }
}

const runtime = new ObservationRuntime({
  sourceAdapter: new BuildkiteSourceAdapter(),
  checkpointStore: new FileCheckpointStore('./.starglass/checkpoints.json'),
  dispatchAdapters: [new CommandDispatchAdapter()],
})

await runtime.poll({
  id: 'buildkite:acme/release',
  source: 'buildkite',
  subject: 'buildkite:acme/release',
  pipeline: 'acme/release',
  dispatch: {
    kind: 'command',
    command: 'node',
    args: ['./handle-event.js'],
  },
})
```

The command target receives a normalized JSON envelope on stdin.

## Strategy-aware observation

Starglass can now resolve a minimal observation strategy from declared capabilities.

Priority order:
1. push
2. conditional request
3. cursor
4. cheap probe then fetch
5. projection diff
6. snapshot diff fallback

Adapters can expose capabilities with `capabilities()`, and targets can add `observationCapabilities` hints. For generic HTTP, Starglass starts honestly in projection-diff mode until it learns validators from a prior response, then upgrades to conditional mode on later polls. The runtime records the chosen strategy in compact checkpoint state and emits `onObservationPlanSelected` hooks.

## Generic HTTP observation

Starglass includes a built-in `HttpObservationAdapter` for generic JSON and HTML resources.

It supports:
- conditional `ETag` and `Last-Modified` reuse once validators are learned
- minimal `Retry-After` and `Cache-Control: max-age` hint capture in compact checkpoint metadata
- normalized JSON projection diffing
- normalized HTML extraction diffing
- compact checkpoint state with validators, next-poll hints, and fingerprints
- no raw response body retention by default

### JSON example

```ts
import {
  FileCheckpointStore,
  HttpObservationAdapter,
  ObservationRuntime,
} from 'starglass'

const runtime = new ObservationRuntime({
  sourceAdapter: new HttpObservationAdapter(),
  checkpointStore: new FileCheckpointStore('./.starglass/http-checkpoints.json'),
  dispatchAdapters: [
    {
      supports(target) {
        return target.kind === 'handler'
      },
      async dispatch(envelope) {
        console.log('meaningful change', envelope.event.payload.projection)
      },
    },
  ],
})

await runtime.poll({
  id: 'http:json:status',
  source: 'http',
  subject: 'http:https://status.example.com/api/summary',
  url: 'https://status.example.com/api/summary',
  format: 'json',
  project: (document) => {
    const payload = document as {
      status: { indicator: string; description: string }
      page: { updated_at: string }
    }

    return {
      indicator: payload.status.indicator,
      description: payload.status.description,
      updatedAt: payload.page.updated_at,
    }
  },
  dispatch: {
    kind: 'handler',
    handler: async (envelope) => {
      console.log('observed projection', envelope.event.payload.projection)
    },
  },
})
```

For HTML targets, replace `format: 'json'` and `project()` with `format: 'html'` and `extract()`.

See `examples/http-observation/README.md` for a focused example.

## Adapter authoring guidance

A good adapter does five things consistently:

1. Chooses one durable `subject` per watched thing.
2. Derives deterministic event ids from provider identity plus the meaningful state transition.
3. Uses a provider cursor or compact validators that can safely resume polling after restarts.
4. Filters raw provider noise down to meaningful normalized events before returning them.
5. Keeps normalized payloads small, stable, and downstream-friendly.

### Subject identity

`target.subject` is the stable identity of the thing being watched, not the identity of one individual event.

Good subjects usually look like:
- `linear:team-123:issue:ABC-42`
- `rss:https://example.com/feed`
- `example.buildkite:acme/release:main`
- `http:https://status.example.com/api/summary`

Use a subject that stays stable across polls and process restarts. If downstream systems should think of two observations as "the same thing", they should share a subject.

### Event ids

`event.id` should be deterministic. If the same upstream change is observed twice, the adapter should produce the same event id so Starglass can suppress duplicates safely. The built-in HTTP adapter keys event ids to the normalized projection fingerprint, which means a later return to a previously seen state reuses the same id by design.

A practical rule is: hash the stable subject, normalized event kind, provider object id, and provider update/version marker.

```ts
const id = stableEventId(target.subject, kind, providerObjectId, providerUpdatedAt)
```

Do not use random ids for provider-backed changes. Random ids defeat duplicate suppression.

### Provider cursor and compact state strategy

`providerCursor` is the adapter-owned resume token. Starglass stores it, but your adapter defines what it means.

Good resumable state is usually one or more of:
- a monotonic provider timestamp
- a provider sequence number
- a page token or opaque checkpoint returned by the provider
- HTTP validators like `ETag` or `Last-Modified`
- a compact fingerprint of the last meaningful projection
- optional next-poll hints derived from generic transport metadata like `Retry-After` or `Cache-Control: max-age`

Choose state that lets the next poll ask "what changed since the last successful run?" without storing whole payload archives.

### Meaningful-change filtering

Adapters should do provider-specific filtering before returning events.

Examples:
- ignore build updates unless the state enters `failed`, `passed`, or another watched terminal state
- ignore issue updates that only change unread counts or internal metadata
- ignore feed entries outside the configured category or policy
- ignore JSON or HTML churn that does not change the normalized observed projection

Starglass handles dispatch, checkpointing, duplicate suppression, and compact strategy state. The adapter should decide which upstream changes are meaningful enough to become normalized events.

### Normalized payload boundaries

`event.payload` should contain the downstream-useful summary of the change, not a full raw provider response dump.

Good payloads usually include:
- the fields downstream automation actually needs
- normalized names and shapes
- a human-readable summary when helpful
- provider-native ids or URLs only when they help follow-up work

Keep bulky or unstable provider details out of the normalized payload when possible. Put traceable provider identity in `sourceRef`.

### External-style examples

See:
- `examples/external-adapter/` for a custom external adapter
- `examples/http-observation/` for generic HTTP observation

## Long-lived watchers and hooks

```ts
const controller = runtime.watch(target, {
  intervalMs: 30_000,
  backoffMs: 5_000,
  maxBackoffMs: 60_000,
  maxConsecutiveFailures: 5,
  cadence: {
    minIntervalMs: 10_000,
    maxIntervalMs: 120_000,
    activityMultiplier: 0.5,
    idleMultiplier: 1.5,
    maxIdleDelayMs: 90_000,
  },
})

await controller.stop()
```

Starglass now plans the next attempt inside the watch loop itself. It uses compact observation metadata like `Retry-After`, `Cache-Control: max-age`, recent activity, and idle streaks, but always clamps the result to caller-supplied cadence bounds.

You can also attach structured hooks without coupling Starglass to a logger or metrics backend:

```ts
const runtime = new ObservationRuntime({
  sourceAdapter,
  checkpointStore,
  dispatchAdapters,
  hooks: {
    onPollStarted: ({ target }) => console.log('poll started', target.id),
    onObservationPlanSelected: ({ strategy }) => console.log('strategy', strategy.mode, strategy.reason),
    onDispatchSucceeded: ({ event }) => console.log('dispatch ok', event.id),
    onDispatchFailed: ({ event, error }) => console.error('dispatch failed', event.id, error),
    onCheckpointAdvanced: ({ reason, record }) => console.log('checkpoint', reason, record.observationTargetId),
    onWatchBackoff: ({ consecutiveFailures, delayMs }) => console.warn('backing off', consecutiveFailures, delayMs),
    onWatchCadencePlanned: ({ reason, delayMs, nextAttemptAt, boundedBy }) => {
      console.log('next attempt', reason, delayMs, nextAttemptAt, boundedBy)
    },
    onWatchStopped: ({ reason }) => console.log('watch stopped', reason),
  },
})
```

`onWatchCadencePlanned` exposes structured, logger-agnostic observability so callers can inspect why a target sped up, slowed down, deferred for freshness hints, or stayed pinned to configured bounds.

The existing `poll()` API remains available for one-shot or job-style usage.

## Release discipline

See `docs/release.md` for the release checklist and packaging contract.

Key commands:
- `npm run verify:packaging` checks the tarball file list and performs a clean install/import smoke test
- `npm run release:check` runs the full local release verification sequence

## Status

V1.1 wedge: runtime, file-backed checkpointing, duplicate suppression, command/handler dispatch, long-lived watch loops, lifecycle hooks, strategy selection, generic HTTP observation for JSON and HTML, and bounded adaptive cadence are implemented.
