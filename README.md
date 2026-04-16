# Starglass

Starglass is a source-agnostic watcher chassis for agents and CLI tools.

It gives you the boring but essential machinery for watcher-style systems:
- observation runtime
- normalized event envelopes
- checkpointing
- duplicate suppression
- dispatch to commands or in-process handlers

You bring the source adapter.

That can be Linear, RSS, a private API, a queue, a database row, or some cursed internal thing only your team understands. Starglass should not care.

## Boundary

Starglass owns:
- watcher lifecycle
- poll-cycle execution
- normalized event contracts
- checkpointing and dedupe
- dispatch primitives

Starglass does not own:
- a first-party source catalog
- provider-specific business logic
- workflow orchestration
- deciding what an agent should do next
- mutating external systems

## Mental model

1. Define an observation target.
2. Implement a `SourceAdapter` that can poll that target and emit normalized events.
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

## Adapter authoring guidance

A good adapter does five things consistently:

1. Chooses one durable `subject` per watched thing.
2. Derives deterministic event ids from provider identity plus the meaningful state transition.
3. Uses a provider cursor that can safely resume polling after restarts.
4. Filters raw provider noise down to meaningful normalized events before returning them.
5. Keeps normalized payloads small, stable, and downstream-friendly.

### Subject identity

`target.subject` is the stable identity of the thing being watched, not the identity of one individual event.

Good subjects usually look like:
- `linear:team-123:issue:ABC-42`
- `rss:https://example.com/feed`
- `example.buildkite:acme/release:main`

Use a subject that stays stable across polls and process restarts. If downstream systems should think of two observations as "the same thing", they should share a subject.

### Event ids

`event.id` should be deterministic. If the same upstream change is observed twice, the adapter should produce the same event id so Starglass can suppress duplicates safely.

A practical rule is: hash the stable subject, normalized event kind, provider object id, and provider update/version marker.

```ts
const id = stableEventId(target.subject, kind, providerObjectId, providerUpdatedAt)
```

Do not use random ids for provider-backed changes. Random ids defeat duplicate suppression.

### Provider cursor strategy

`providerCursor` is the adapter-owned resume token. Starglass stores it, but your adapter defines what it means.

Good cursors are usually one of:
- a monotonic provider timestamp
- a provider sequence number
- a page token or opaque checkpoint returned by the provider

Choose a cursor that lets the next poll ask "what changed since the last successful run?". If the provider can return ties at the cursor boundary, keep the event id deterministic so replay at the boundary is harmless.

### Meaningful-change filtering

Adapters should do provider-specific filtering before returning events.

Examples:
- ignore build updates unless the state enters `failed`, `passed`, or another watched terminal state
- ignore issue updates that only change unread counts or internal metadata
- ignore feed entries outside the configured category or policy

Starglass handles dispatch, checkpointing, and duplicate suppression. The adapter should decide which upstream changes are meaningful enough to become normalized events.

### Normalized payload boundaries

`event.payload` should contain the downstream-useful summary of the change, not a full raw provider response dump.

Good payloads usually include:
- the fields downstream automation actually needs
- normalized names and shapes
- a human-readable summary when helpful
- provider-native ids or URLs only when they help follow-up work

Keep bulky or unstable provider details out of the normalized payload when possible. Put traceable provider identity in `sourceRef`.

### External-style example

See `examples/external-adapter/` for a concrete adapter that:
- defines its own target type
- filters meaningful build states
- derives stable event ids
- advances a provider cursor
- emits normalized events
- uses only the public `starglass` package surface

## Long-lived watchers and hooks

```ts
const controller = runtime.watch(target, {
  intervalMs: 30_000,
  backoffMs: 5_000,
  maxBackoffMs: 60_000,
  maxConsecutiveFailures: 5,
})

await controller.stop()
```

You can also attach structured hooks without coupling Starglass to a logger or metrics backend:

```ts
const runtime = new ObservationRuntime({
  sourceAdapter,
  checkpointStore,
  dispatchAdapters,
  hooks: {
    onPollStarted: ({ target }) => console.log('poll started', target.id),
    onDispatchSucceeded: ({ event }) => console.log('dispatch ok', event.id),
    onDispatchFailed: ({ event, error }) => console.error('dispatch failed', event.id, error),
    onCheckpointAdvanced: ({ reason, record }) => console.log('checkpoint', reason, record.observationTargetId),
    onWatchBackoff: ({ consecutiveFailures, delayMs }) => console.warn('backing off', consecutiveFailures, delayMs),
    onWatchStopped: ({ reason }) => console.log('watch stopped', reason),
  },
})
```

The existing `poll()` API remains available for one-shot or job-style usage.

## Release discipline

See `docs/release.md` for the release checklist and packaging contract.

Key commands:
- `npm run verify:packaging` checks the tarball file list and performs a clean install/import smoke test
- `npm run release:check` runs the full local release verification sequence

## Status

V1 runtime, file-backed checkpointing, duplicate suppression, command/handler dispatch, long-lived watch loops, lifecycle hooks, and release verification discipline are implemented.
