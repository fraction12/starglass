import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  CommandDispatchAdapter,
  CorruptedCheckpointStateError,
  FeedObservationAdapter,
  FileCheckpointStore,
  FileSystemObservationAdapter,
  HttpObservationAdapter,
  ObservationRuntime,
  defineEvent,
  eventIsNewerThanCursor,
  createObservationPlan,
  html,
  normalize,
  projectJson,
  selectObservationStrategy,
  stableEventId,
  type CheckpointRecord,
  type DispatchAdapter,
  type DispatchEnvelope,
  type DispatchTarget,
  type FeedEntrySnapshot,
  type ObservationEvent,
  type ObservationTarget,
  type RuntimeHooks,
  type SourceAdapter,
} from '../src/index.js'

type ExampleTarget = ObservationTarget & {
  source: 'example.build'
  watch: string[]
}

class RecordingDispatchAdapter implements DispatchAdapter {
  readonly envelopes: DispatchEnvelope[] = []
  supports(target: DispatchTarget): target is DispatchTarget {
    return target.kind === 'handler'
  }
  async dispatch(envelope: DispatchEnvelope): Promise<void> {
    this.envelopes.push(envelope)
  }
}

class FailingDispatchAdapter implements DispatchAdapter {
  supports(target: DispatchTarget): target is DispatchTarget {
    return target.kind === 'handler'
  }
  async dispatch(): Promise<void> {
    throw new Error('boom')
  }
}

class ExampleSourceAdapter implements SourceAdapter<ExampleTarget> {
  readonly source = 'example.build'

  constructor(
    private readonly events: ObservationEvent[],
    private readonly providerCursor = '2026-04-16T01:00:00.000Z',
  ) {}

  capabilities(_target: ObservationTarget, _checkpoint?: CheckpointRecord) {
    return {
      cursor: true,
      projectionDiff: true,
    }
  }

  async poll(target: ExampleTarget, checkpoint?: CheckpointRecord) {
    const filtered = this.events
      .filter((event) => target.watch.includes(event.kind))
      .filter((event) => eventIsNewerThanCursor(event, checkpoint?.providerCursor))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))

    return {
      events: filtered,
      providerCursor: this.providerCursor,
      polledAt: '2026-04-16T01:05:00.000Z',
    }
  }
}

class SequencedSourceAdapter implements SourceAdapter<ExampleTarget> {
  readonly source = 'example.build'
  private index = 0

  constructor(private readonly batches: ObservationEvent[][]) {}

  capabilities(_target: ObservationTarget, _checkpoint?: CheckpointRecord) {
    return {
      cursor: true,
    }
  }

  async poll(): Promise<{ events: ObservationEvent[]; polledAt: string; providerCursor: string }> {
    const events = this.batches[Math.min(this.index, this.batches.length - 1)] ?? []
    this.index += 1
    return {
      events,
      providerCursor: `cursor-${this.index}`,
      polledAt: `2026-04-16T01:05:0${Math.min(this.index, 9)}.000Z`,
    }
  }
}

class FailingThenPassingSourceAdapter implements SourceAdapter<ExampleTarget> {
  readonly source = 'example.build'
  calls = 0

  constructor(private readonly failuresBeforeSuccess: number) {}

  capabilities(_target: ObservationTarget, _checkpoint?: CheckpointRecord) {
    return {
      cursor: true,
    }
  }

  async poll(): Promise<{ events: ObservationEvent[]; polledAt: string; providerCursor: string }> {
    this.calls += 1
    if (this.calls <= this.failuresBeforeSuccess) {
      throw new Error(`poll failed ${this.calls}`)
    }

    return {
      events: [],
      providerCursor: `cursor-${this.calls}`,
      polledAt: `2026-04-16T01:06:0${Math.min(this.calls, 9)}.000Z`,
    }
  }
}

function makeTarget(input?: Partial<ExampleTarget>): ExampleTarget {
  return {
    id: input?.id ?? 'target-a',
    source: 'example.build',
    subject: input?.subject ?? 'example.build:acme/release',
    watch: input?.watch ?? ['build.failed', 'build.succeeded'],
    observationCapabilities: input?.observationCapabilities,
    dispatch: input?.dispatch ?? { kind: 'handler', handler: async () => {} },
  }
}

function makeEvent(input?: Partial<ObservationEvent>): ObservationEvent {
  return defineEvent({
    id: input?.id ?? stableEventId('build.failed', 'acme/release', 1),
    kind: input?.kind ?? 'build.failed',
    source: input?.source ?? 'example.build.status',
    subject: input?.subject ?? 'example.build:acme/release',
    occurredAt: input?.occurredAt ?? '2026-04-16T00:00:00.000Z',
    payload: input?.payload ?? { pipeline: 'acme/release', status: 'failed' },
    ...(input?.sourceRef ? { sourceRef: input.sourceRef } : {}),
  })
}

function makeHooks(log: string[]): RuntimeHooks<ExampleTarget> {
  return {
    onPollStarted: ({ target }) => {
      log.push(`poll-start:${target.id}`)
    },
    onPollCompleted: ({ target, dispatchedCount, suppressedCount }) => {
      log.push(`poll-complete:${target.id}:${dispatchedCount}:${suppressedCount}`)
    },
    onEventSuppressed: ({ event }) => {
      log.push(`suppressed:${event.id}`)
    },
    onDispatchSucceeded: ({ event }) => {
      log.push(`dispatch-ok:${event.id}`)
    },
    onDispatchFailed: ({ event, error }) => {
      log.push(`dispatch-failed:${event.id}:${(error as Error).message}`)
    },
    onCheckpointAdvanced: ({ reason, record }) => {
      log.push(`checkpoint:${reason}:${record.dispatchedEventIds.length}`)
    },
    onWatchStarted: ({ target, intervalMs }) => {
      log.push(`watch-start:${target.id}:${intervalMs}`)
    },
    onWatchCycleFailed: ({ consecutiveFailures, error }) => {
      log.push(`watch-failed:${consecutiveFailures}:${(error as Error).message}`)
    },
    onWatchBackoff: ({ consecutiveFailures, delayMs }) => {
      log.push(`watch-backoff:${consecutiveFailures}:${delayMs}`)
    },
    onWatchCadencePlanned: ({ reason, delayMs, changed, idleStreak, boundedBy }) => {
      log.push(`watch-cadence:${reason}:${delayMs}:${changed ? 'changed' : 'same'}:${idleStreak}:${boundedBy}`)
    },
    onWatchStopped: ({ reason }) => {
      log.push(`watch-stop:${reason}`)
    },
    onObservationPlanSelected: ({ plan }) => {
      log.push(`plan:${plan.strategy.mode}:${plan.change.kind}`)
    },
  }
}

test('stableEventId is deterministic and cursor checks are generic', () => {
  const left = stableEventId('build.failed', 'acme/release', 1)
  const right = stableEventId('build.failed', 'acme/release', 1)
  const event = makeEvent({ occurredAt: '2026-04-16T00:04:00.000Z' })

  assert.equal(left, right)
  assert.equal(eventIsNewerThanCursor(event, '2026-04-16T00:03:00.000Z'), true)
  assert.equal(eventIsNewerThanCursor(event, '2026-04-16T00:05:00.000Z'), false)
})

test('strategy selection prefers cheaper credible capabilities before snapshot diff', () => {
  assert.equal(selectObservationStrategy({ push: true, conditionalRequest: true }).mode, 'push')
  assert.equal(selectObservationStrategy({ conditionalRequest: true, cursor: true }).mode, 'conditional')
  assert.equal(selectObservationStrategy({ cursor: true, projectionDiff: true }).mode, 'cursor')
  assert.equal(selectObservationStrategy({ cheapProbe: true }).mode, 'probe-then-fetch')
  assert.equal(selectObservationStrategy({ projectionDiff: true }).mode, 'projection-diff')
  assert.equal(selectObservationStrategy({}).mode, 'snapshot-diff')
})

test('observation plan reports initial fallback, upgrade, degradation, and resumed planning honestly', () => {
  const initial = createObservationPlan({
    adapterCapabilities: { projectionDiff: true },
  })
  const upgraded = createObservationPlan({
    adapterCapabilities: { conditionalRequest: true, projectionDiff: true },
    previousStrategy: initial.strategy,
    resumedFromCheckpoint: true,
  })
  const degraded = createObservationPlan({
    adapterCapabilities: { projectionDiff: true },
    previousStrategy: upgraded.strategy,
    resumedFromCheckpoint: true,
  })
  const resumedWithoutHistory = createObservationPlan({
    adapterCapabilities: { cursor: true },
    resumedFromCheckpoint: true,
  })

  assert.equal(initial.strategy.mode, 'projection-diff')
  assert.equal(initial.change.kind, 'initial')
  assert.match(initial.change.reason, /first observation plan/)
  assert.equal(upgraded.strategy.mode, 'conditional')
  assert.equal(upgraded.change.kind, 'upgraded')
  assert.match(upgraded.change.reason, /upgraded from projection-diff to conditional/)
  assert.equal(degraded.strategy.mode, 'projection-diff')
  assert.equal(degraded.change.kind, 'degraded')
  assert.match(degraded.change.reason, /degraded from conditional to projection-diff/)
  assert.equal(resumedWithoutHistory.strategy.mode, 'cursor')
  assert.equal(resumedWithoutHistory.change.kind, 'initial')
  assert.match(resumedWithoutHistory.change.reason, /resumed without a prior recorded plan/)
})

test('custom source adapters can filter meaningful events and respect cursors', async () => {
  const adapter = new ExampleSourceAdapter([
    makeEvent({ id: stableEventId('build.started', 1), kind: 'build.started', occurredAt: '2026-04-16T00:00:00.000Z' }),
    makeEvent({ id: stableEventId('build.failed', 1), kind: 'build.failed', occurredAt: '2026-04-16T00:04:00.000Z' }),
  ])

  const result = await adapter.poll(
    makeTarget({ watch: ['build.failed'] }),
    {
      observationTargetId: 'target-a',
      source: 'example.build',
      subject: 'example.build:acme/release',
      providerCursor: '2026-04-16T00:03:30.000Z',
      dispatchedEventIds: [],
    },
  )

  assert.equal(result.events.length, 1)
  assert.equal(result.events[0]?.kind, 'build.failed')
})

test('runtime suppresses duplicates and isolates checkpoints by target', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointStore = new FileCheckpointStore(path.join(dir, 'checkpoints.json'))
    const dispatch = new RecordingDispatchAdapter()
    const event = makeEvent()

    const runtime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([event]),
      checkpointStore,
      dispatchAdapters: [dispatch],
    })

    const targetA = makeTarget({ id: 'target-a', subject: 'example.build:acme/release-a' })
    const targetB = makeTarget({ id: 'target-b', subject: 'example.build:acme/release-b' })

    const first = await runtime.poll(targetA)
    const second = await runtime.poll(targetA)
    const third = await runtime.poll(targetB)

    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
    assert.equal(third.length, 1)
    assert.equal(dispatch.envelopes.length, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runtime resumes from file-backed checkpoint state after restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const event = makeEvent({ id: stableEventId('build.failed', 'resume'), occurredAt: '2026-04-16T00:02:00.000Z' })

    const firstDispatch = new RecordingDispatchAdapter()
    const firstRuntime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([event]),
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [firstDispatch],
    })

    const target = makeTarget()
    await firstRuntime.poll(target)

    const secondDispatch = new RecordingDispatchAdapter()
    const secondRuntime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([event]),
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [secondDispatch],
    })

    const replay = await secondRuntime.poll(target)
    assert.equal(replay.length, 0)
    assert.equal(secondDispatch.envelopes.length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file-backed checkpoint store rejects malformed checkpoint JSON with diagnosable error', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    await writeFile(checkpointPath, '{"target-a": ', 'utf8')

    const store = new FileCheckpointStore(checkpointPath)

    await assert.rejects(
      () => store.read('target-a'),
      (error: unknown) => {
        assert.ok(error instanceof CorruptedCheckpointStateError)
        assert.match((error as Error).message, /corrupted or unreadable: invalid JSON/)
        assert.equal((error as CorruptedCheckpointStateError).filePath, checkpointPath)
        return true
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file-backed checkpoint store rejects structurally invalid checkpoint state', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    await writeFile(
      checkpointPath,
      `${JSON.stringify({
        'target-a': {
          observationTargetId: 'other-target',
          source: 'example.build',
          subject: 'example.build:acme/release',
          dispatchedEventIds: ['evt-1'],
        },
      })}\n`,
      'utf8',
    )

    const store = new FileCheckpointStore(checkpointPath)

    await assert.rejects(
      () => store.read('target-a'),
      (error: unknown) => {
        assert.ok(error instanceof CorruptedCheckpointStateError)
        assert.match((error as Error).message, /expected an object keyed by observation target id/)
        return true
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file-backed checkpoint store rejects invalid persisted observation plan change kinds', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    await writeFile(
      checkpointPath,
      `${JSON.stringify({
        'target-a': {
          observationTargetId: 'target-a',
          source: 'example.build',
          subject: 'example.build:acme/release',
          observation: {
            strategy: { mode: 'cursor', reason: 'cursor available' },
            plan: {
              strategy: { mode: 'cursor', reason: 'cursor available' },
              capabilities: { cursor: true },
              change: { kind: 'sideways', reason: 'nonsense' },
              inputs: {
                target: {},
                adapter: { cursor: true },
                resumedFromCheckpoint: true,
              },
            },
          },
          dispatchedEventIds: [],
        },
      })}\n`,
      'utf8',
    )

    const store = new FileCheckpointStore(checkpointPath)

    await assert.rejects(
      () => store.read('target-a'),
      (error: unknown) => {
        assert.ok(error instanceof CorruptedCheckpointStateError)
        assert.match((error as Error).message, /expected an object keyed by observation target id/)
        return true
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file-backed checkpoint store keeps previous live state when replacement rename fails', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')

    class RenameFailingCheckpointStore extends FileCheckpointStore {
      protected override async rename(): Promise<void> {
        throw new Error('rename exploded')
      }
    }

    const initialRecord: CheckpointRecord = {
      observationTargetId: 'target-a',
      source: 'example.build',
      subject: 'example.build:acme/release',
      providerCursor: 'cursor-1',
      observation: {
        fingerprint: 'abc',
      },
      dispatchedEventIds: ['evt-1'],
    }

    await new FileCheckpointStore(checkpointPath).write(initialRecord)
    const before = await readFile(checkpointPath, 'utf8')

    const store = new RenameFailingCheckpointStore(checkpointPath)
    await assert.rejects(
      () =>
        store.write({
          ...initialRecord,
          providerCursor: 'cursor-2',
          observation: {
            fingerprint: 'def',
          },
          dispatchedEventIds: ['evt-1', 'evt-2'],
        }),
      /rename exploded/,
    )

    const after = await readFile(checkpointPath, 'utf8')
    assert.equal(after, before)

    const persisted = await new FileCheckpointStore(checkpointPath).read('target-a')
    assert.equal(persisted?.providerCursor, 'cursor-1')
    assert.deepEqual(persisted?.dispatchedEventIds, ['evt-1'])
    assert.equal(persisted?.observation?.fingerprint, 'abc')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runtime does not advance checkpoint when dispatch fails', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const event = makeEvent({ id: stableEventId('build.failed', 'checkpoint-failure'), occurredAt: '2026-04-16T00:02:00.000Z' })

    const runtime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([event]),
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [new FailingDispatchAdapter()],
    })

    await assert.rejects(() => runtime.poll(makeTarget()), /boom/)
    await assert.rejects(() => readFile(checkpointPath, 'utf8'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('command dispatch adapter writes machine-readable envelope to stdin', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const outputPath = path.join(dir, 'envelope.json')
    const adapter = new CommandDispatchAdapter()
    const event = makeEvent()

    await adapter.dispatch(
      {
        event,
        observationTargetId: 'target-a',
        checkpointKey: 'target-a:key',
        target: {
          kind: 'command',
          command: process.execPath,
          args: ['-e', `process.stdin.pipe(require('node:fs').createWriteStream(${JSON.stringify(outputPath)}))`],
        },
      },
      {
        kind: 'command',
        command: process.execPath,
        args: ['-e', `process.stdin.pipe(require('node:fs').createWriteStream(${JSON.stringify(outputPath)}))`],
      },
    )

    const raw = await readFile(outputPath, 'utf8')
    const parsed = JSON.parse(raw) as DispatchEnvelope
    assert.equal(parsed.event.id, event.id)
    assert.equal(parsed.observationTargetId, 'target-a')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop repeats polling and stops cleanly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const eventA = makeEvent({ id: stableEventId('build.failed', 'watch-a') })
    const eventB = makeEvent({ id: stableEventId('build.failed', 'watch-b'), occurredAt: '2026-04-16T00:01:00.000Z' })
    const sourceAdapter = new SequencedSourceAdapter([[eventA], [eventB], []])
    const dispatch = new RecordingDispatchAdapter()
    const log: string[] = []

    const runtime = new ObservationRuntime({
      sourceAdapter,
      checkpointStore: new FileCheckpointStore(path.join(dir, 'checkpoints.json')),
      dispatchAdapters: [dispatch],
      hooks: makeHooks(log),
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      cadence: {
        minIntervalMs: 2,
        maxIntervalMs: 20,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    await controller.stop()

    assert.ok(sourceAdapter['index'] >= 2)
    assert.equal(dispatch.envelopes.length, 2)
    assert.ok(log.includes('watch-start:target-a:5'))
    assert.ok(log.includes('watch-stop:stopped'))
    assert.ok(log.includes('plan:cursor:initial'))
    assert.ok(log.some((entry) => entry.startsWith('watch-cadence:activity:')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop backs off after failure and recovers', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const sourceAdapter = new FailingThenPassingSourceAdapter(1)
    const log: string[] = []

    const runtime = new ObservationRuntime({
      sourceAdapter,
      checkpointStore: new FileCheckpointStore(path.join(dir, 'checkpoints.json')),
      dispatchAdapters: [new RecordingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      backoffMs: 7,
      maxBackoffMs: 20,
      cadence: {
        minIntervalMs: 3,
        maxIntervalMs: 20,
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 35))
    await controller.stop()

    assert.ok(sourceAdapter.calls >= 2)
    assert.ok(log.includes('watch-failed:1:poll failed 1'))
    assert.ok(log.includes('watch-backoff:1:7'))
    assert.ok(log.some((entry) => entry.startsWith('watch-cadence:failure-backoff:7:changed')))
    assert.ok(log.includes('watch-stop:stopped'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop fails terminally when max consecutive failures is reached', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const sourceAdapter = new FailingThenPassingSourceAdapter(5)
    const log: string[] = []

    const runtime = new ObservationRuntime({
      sourceAdapter,
      checkpointStore: new FileCheckpointStore(path.join(dir, 'checkpoints.json')),
      dispatchAdapters: [new RecordingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      backoffMs: 5,
      maxBackoffMs: 10,
      maxConsecutiveFailures: 2,
      cadence: {
        minIntervalMs: 3,
        maxIntervalMs: 10,
      },
    })

    await assert.rejects(() => controller.stopped, /poll failed 2/)
    assert.ok(log.includes('watch-failed:1:poll failed 1'))
    assert.ok(log.includes('watch-failed:2:poll failed 2'))
    assert.ok(log.some((entry) => entry.startsWith('watch-cadence:failure-backoff:5:changed')))
    assert.ok(log.includes('watch-stop:failed'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runtime emits suppression, dispatch failure, checkpoint hooks, and plan hooks for one-shot poll', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const event = makeEvent({ id: stableEventId('build.failed', 'hooked') })
    const checkpointStore = new FileCheckpointStore(checkpointPath)
    const log: string[] = []

    const successRuntime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([event], '2026-04-16T00:00:00.000Z'),
      checkpointStore,
      dispatchAdapters: [new RecordingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    await successRuntime.poll(makeTarget())
    await successRuntime.poll(makeTarget())

    const failingRuntime = new ObservationRuntime({
      sourceAdapter: new ExampleSourceAdapter([makeEvent({ id: stableEventId('build.failed', 'dispatch-fail-new'), occurredAt: '2026-04-16T00:10:00.000Z' })], '2026-04-16T01:10:00.000Z'),
      checkpointStore: new FileCheckpointStore(path.join(dir, 'other-checkpoints.json')),
      dispatchAdapters: [new FailingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    await assert.rejects(() => failingRuntime.poll(makeTarget()), /boom/)

    assert.ok(log.some((entry) => entry.startsWith('dispatch-ok:')))
    assert.ok(log.some((entry) => entry.startsWith('suppressed:')))
    assert.ok(log.some((entry) => entry === 'checkpoint:dispatched:1'))
    assert.ok(log.some((entry) => entry === 'checkpoint:suppressed:1'))
    assert.ok(log.some((entry) => entry.startsWith('dispatch-failed:')))
    assert.ok(log.some((entry) => entry.startsWith('poll-complete:target-a:1:0')))
    assert.ok(log.some((entry) => entry === 'plan:cursor:initial'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('http observation reports projection-diff before validators are learned, then upgrades to conditional', async () => {
  const responses = [
    new Response(JSON.stringify({ title: 'One' }), {
      status: 200,
      headers: {
        etag: '"v1"',
        'content-type': 'application/json',
      },
    }),
    new Response(null, {
      status: 304,
      headers: {
        etag: '"v1"',
      },
    }),
  ]

  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () => {
      const response = responses.shift()
      if (!response) {
        throw new Error('missing response')
      }
      return response
    },
  })

  const target = {
    id: 'http:json:news-strategy',
    source: 'http' as const,
    subject: 'http:https://example.test/news.json',
    url: 'https://example.test/news.json',
    format: 'json' as const,
    project: (document: unknown) => ({ title: (document as { title: string }).title }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: first.observation,
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.observation?.strategy?.mode, 'projection-diff')
  assert.equal(first.observation?.plan?.strategy.mode, 'projection-diff')
  assert.equal(first.observation?.plan?.change.kind, 'initial')
  assert.equal(second.observation?.strategy?.mode, 'conditional')
  assert.equal(second.observation?.plan?.strategy.mode, 'conditional')
  assert.equal(second.observation?.plan?.previousStrategy?.mode, 'projection-diff')
  assert.equal(second.observation?.plan?.change.kind, 'upgraded')
})

test('http observation uses validators, persists compact fingerprint state, and suppresses unchanged 304 cycles', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const responses = [
      new Response(JSON.stringify({ title: 'One', noisy: 1 }), {
        status: 200,
        headers: {
          etag: '"v1"',
          'last-modified': 'Wed, 16 Apr 2026 18:00:00 GMT',
          'content-type': 'application/json',
        },
      }),
      new Response(null, {
        status: 304,
        headers: {
          etag: '"v1"',
        },
      }),
    ]

    const seenHeaders: Array<Record<string, string>> = []
    const adapter = new HttpObservationAdapter({
      now: () => '2026-04-16T18:05:00.000Z',
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers)
        seenHeaders.push(Object.fromEntries(headers.entries()))
        const response = responses.shift()
        if (!response) {
          throw new Error('missing response')
        }
        return response
      },
    })

    const dispatch = new RecordingDispatchAdapter()
    const runtime = new ObservationRuntime({
      sourceAdapter: adapter,
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [dispatch],
    })

    const target = {
      id: 'http:json:news',
      source: 'http' as const,
      subject: 'http:https://example.test/news.json',
      url: 'https://example.test/news.json',
      format: 'json' as const,
      project: (document: unknown) => {
        const payload = document as { title: string; noisy: number }
        return { title: payload.title }
      },
      dispatch: { kind: 'handler' as const, handler: async () => {} },
    }

    const first = await runtime.poll(target)
    const second = await runtime.poll(target)
    const stored = await new FileCheckpointStore(checkpointPath).read(target.id)

    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
    assert.equal(dispatch.envelopes.length, 1)
    assert.deepEqual(first[0]?.payload, {
      url: 'https://example.test/news.json',
      format: 'json',
      projection: { title: 'One' },
    })
    assert.equal(stored?.observation?.http?.etag, '"v1"')
    assert.equal(stored?.observation?.http?.lastModified, 'Wed, 16 Apr 2026 18:00:00 GMT')
    assert.ok(typeof stored?.observation?.fingerprint === 'string')
    assert.equal(stored?.observation?.strategy?.mode, 'conditional')
    assert.equal(stored?.observation?.plan?.strategy.mode, 'conditional')
    assert.equal(stored?.observation?.plan?.change.kind, 'upgraded')
    assert.equal(seenHeaders[1]?.['if-none-match'], '"v1"')
    assert.equal(seenHeaders[1]?.['if-modified-since'], 'Wed, 16 Apr 2026 18:00:00 GMT')
    const persistedRaw = await readFile(checkpointPath, 'utf8')
    assert.doesNotMatch(persistedRaw, /"title": "One"/)
    assert.doesNotMatch(persistedRaw, /"noisy": 1/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('http observation ignores irrelevant JSON churn via normalized projection diff', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response(JSON.stringify({ b: 2, a: 1, noisy: Date.now() }), {
        status: 200,
        headers: { etag: '"same-shape"' },
      }),
  })

  const target = {
    id: 'http:json:stable',
    source: 'http' as const,
    subject: 'http:https://example.test/stable.json',
    url: 'https://example.test/stable.json',
    format: 'json' as const,
    project: (document: unknown) => {
      const payload = document as { a: number; b: number }
      return { b: payload.b, a: payload.a }
    },
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: first.observation,
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.events.length, 1)
  assert.equal(second.events.length, 0)
})

test('json projection helpers compose meaningful fields deterministically', async () => {
  const project = projectJson.shape({
    title: projectJson.path('status', 'title'),
    state: projectJson.path('status', 'state'),
    summary: (document) => projectJson.pick<{ summary: string }, ['summary']>('summary')(document).summary,
  })

  assert.deepEqual(
    project({
      summary: 'All systems nominal',
      status: { state: 'green', title: 'Healthy' },
      noisy: true,
    }),
    {
      title: 'Healthy',
      state: 'green',
      summary: 'All systems nominal',
    },
  )
})

test('normalization collapses equivalent values for hashing and diffing', async () => {
  const left = normalize.stable({
    b: 2,
    a: 1,
    skip: undefined,
    nested: { z: -0, x: Number.NaN, y: Number.POSITIVE_INFINITY },
  })
  const right = normalize.stable({
    a: 1,
    nested: { y: Number.POSITIVE_INFINITY, x: Number.NaN, z: 0 },
    b: 2,
  })

  assert.deepEqual(left, right)
})

test('http observation supports html extraction diffing without storing raw html', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response('<html><body><h1>Headline</h1><div class="chrome">Layout</div></body></html>', {
        status: 200,
        headers: { etag: '"html-v1"' },
      }),
  })

  const target = {
    id: 'http:html:headline',
    source: 'http' as const,
    subject: 'http:https://example.test/page',
    url: 'https://example.test/page',
    format: 'html' as const,
    extract: html.extract((document: string) => {
      const match = document.match(/<h1>(.*?)<\/h1>/)
      return { headline: match?.[1] ?? null }
    }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const result = await adapter.poll(target)

  assert.equal(result.events.length, 1)
  assert.deepEqual(result.events[0]?.payload, {
    url: 'https://example.test/page',
    format: 'html',
    projection: { headline: 'Headline' },
  })
  assert.ok(result.observation?.fingerprint)
  assert.equal(result.observation?.http?.etag, '"html-v1"')
})


test('html extraction contract accepts wrapped projection results', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response('<html><body><main><h1>Wrapped</h1></main></body></html>', {
        status: 200,
      }),
  })

  const target = {
    id: 'http:html:wrapped',
    source: 'http' as const,
    subject: 'http:https://example.test/wrapped',
    url: 'https://example.test/wrapped',
    format: 'html' as const,
    extract: html.extract(() => ({ headline: 'Wrapped' })),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const result = await adapter.poll(target)
  assert.deepEqual(result.events[0]?.payload, {
    url: 'https://example.test/wrapped',
    format: 'html',
    projection: { headline: 'Wrapped' },
  })
})

test('plain html projections may contain a projection field without being collapsed', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response('<html><body><main><h1>Wrapped</h1></main></body></html>', {
        status: 200,
      }),
  })

  const target = {
    id: 'http:html:projection-field',
    source: 'http' as const,
    subject: 'http:https://example.test/projection-field',
    url: 'https://example.test/projection-field',
    format: 'html' as const,
    extract: () => ({ projection: 'Wrapped', other: 1 }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const result = await adapter.poll(target)
  assert.deepEqual(result.events[0]?.payload, {
    url: 'https://example.test/projection-field',
    format: 'html',
    projection: { other: 1, projection: 'Wrapped' },
  })
})

test('http observation persists retry and cache hints as compact next-poll metadata', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response(JSON.stringify({ title: 'Hinted' }), {
        status: 200,
        headers: {
          etag: '"v2"',
          'retry-after': '120',
          'cache-control': 'public, max-age=60',
        },
      }),
  })

  const target = {
    id: 'http:json:hints',
    source: 'http' as const,
    subject: 'http:https://example.test/hints.json',
    url: 'https://example.test/hints.json',
    format: 'json' as const,
    project: (document: unknown) => ({ title: (document as { title: string }).title }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const result = await adapter.poll(target)

  assert.equal(result.observation?.http?.retryAfterAt, '2026-04-16T18:07:00.000Z')
  assert.equal(result.observation?.http?.nextPollAfter, '2026-04-16T18:06:00.000Z')
})

test('watch loop slows down quiet targets within caller bounds and persists next attempt metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const sourceAdapter = new SequencedSourceAdapter([[], [], []])
    const runtime = new ObservationRuntime({
      sourceAdapter,
      checkpointStore: new FileCheckpointStore(path.join(dir, 'checkpoints.json')),
      dispatchAdapters: [new RecordingDispatchAdapter()],
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      cadence: {
        minIntervalMs: 5,
        maxIntervalMs: 20,
        idleMultiplier: 2,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 25))
    await controller.stop()

    const stored = await new FileCheckpointStore(path.join(dir, 'checkpoints.json')).read('target-a')
    assert.equal(stored?.observation?.cadence?.idleStreak, 3)
    assert.equal(stored?.observation?.cadence?.currentDelayMs, 20)
    assert.equal(stored?.observation?.cadence?.lastReason, 'idle')
    assert.ok(stored?.observation?.cadence?.nextAttemptAt)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop preserves lastObservedChangeAt across later cadence updates', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const sourceAdapter = new SequencedSourceAdapter([[makeEvent({ id: stableEventId('build.failed', 'cadence-change') })], [], []])
    const runtime = new ObservationRuntime({
      sourceAdapter,
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [new RecordingDispatchAdapter()],
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      cadence: {
        minIntervalMs: 5,
        maxIntervalMs: 20,
        idleMultiplier: 2,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 25))
    await controller.stop()

    const stored = await new FileCheckpointStore(checkpointPath).read('target-a')
    assert.equal(stored?.observation?.cadence?.lastObservedChangeAt, '2026-04-16T01:05:01.000Z')
    assert.equal(stored?.observation?.cadence?.lastReason, 'idle')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop honors persisted http hints within caller bounds', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const log: string[] = []
    const checkpointStore = new FileCheckpointStore(path.join(dir, 'checkpoints.json'))
    await checkpointStore.write({
      observationTargetId: 'target-a',
      source: 'example.build',
      subject: 'example.build:acme/release',
      lastSuccessfulPollAt: new Date(Date.now() - 30_000).toISOString(),
      observation: {
        http: {
          retryAfterAt: new Date(Date.now() + 30_000).toISOString(),
          nextPollAfter: new Date(Date.now() + 20_000).toISOString(),
        },
      },
      dispatchedEventIds: [],
    })

    const runtime = new ObservationRuntime({
      sourceAdapter: new SequencedSourceAdapter([[]]),
      checkpointStore,
      dispatchAdapters: [new RecordingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      cadence: {
        minIntervalMs: 5,
        maxIntervalMs: 15,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    await controller.stop()

    assert.ok(log.some((entry) => entry.startsWith('watch-cadence:retry-after:15:changed')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runtime replans degraded strategy when resumable capability disappears after restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const checkpointStore = new FileCheckpointStore(checkpointPath)
    await checkpointStore.write({
      observationTargetId: 'target-a',
      source: 'example.build',
      subject: 'example.build:acme/release',
      observation: {
        strategy: { mode: 'conditional', reason: 'conditional requests available' },
        plan: {
          strategy: { mode: 'conditional', reason: 'conditional requests available' },
          capabilities: { conditionalRequest: true, projectionDiff: true },
          change: {
            kind: 'initial',
            reason: 'seeded state',
          },
          inputs: {
            target: {},
            adapter: { conditionalRequest: true, projectionDiff: true },
            resumedFromCheckpoint: true,
          },
        },
      },
      dispatchedEventIds: [],
    })

    const log: string[] = []
    const runtime = new ObservationRuntime({
      sourceAdapter: {
        source: 'example.build',
        capabilities() {
          return { projectionDiff: true }
        },
        async poll() {
          return {
            events: [],
            polledAt: '2026-04-16T02:00:00.000Z',
          }
        },
      },
      checkpointStore,
      dispatchAdapters: [new RecordingDispatchAdapter()],
      hooks: makeHooks(log),
    })

    await runtime.poll(makeTarget())
    const stored = await checkpointStore.read('target-a')

    assert.ok(log.includes('plan:projection-diff:degraded'))
    assert.equal(stored?.observation?.plan?.previousStrategy?.mode, 'conditional')
    assert.equal(stored?.observation?.plan?.strategy.mode, 'projection-diff')
    assert.equal(stored?.observation?.plan?.change.kind, 'degraded')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('watch loop prunes expired http hint timestamps after they are consumed', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const checkpointStore = new FileCheckpointStore(checkpointPath)
    await checkpointStore.write({
      observationTargetId: 'target-a',
      source: 'example.build',
      subject: 'example.build:acme/release',
      lastSuccessfulPollAt: new Date(Date.now() - 30_000).toISOString(),
      observation: {
        http: {
          retryAfterAt: new Date(Date.now() - 1_000).toISOString(),
          nextPollAfter: new Date(Date.now() - 1_000).toISOString(),
        },
      },
      dispatchedEventIds: [],
    })

    const runtime = new ObservationRuntime({
      sourceAdapter: {
        source: 'example.build',
        async poll() {
          return {
            events: [],
            providerCursor: 'cursor-live',
            polledAt: new Date().toISOString(),
          }
        },
      },
      checkpointStore,
      dispatchAdapters: [new RecordingDispatchAdapter()],
    })

    const controller = runtime.watch(makeTarget(), {
      intervalMs: 5,
      cadence: {
        minIntervalMs: 5,
        maxIntervalMs: 15,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 25))
    await controller.stop()

    const stored = await checkpointStore.read('target-a')
    assert.equal(stored?.observation?.http?.retryAfterAt, undefined)
    assert.equal(stored?.observation?.http?.nextPollAfter, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('http observation event ids are state-based, so a later recurrence of the same projection stays suppressed', async () => {
  const adapter = new HttpObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () =>
      new Response(JSON.stringify({ title: 'Recurring' }), {
        status: 200,
        headers: { etag: '"recurring"' },
      }),
  })

  const target = {
    id: 'http:json:recurring',
    source: 'http' as const,
    subject: 'http:https://example.test/recurring.json',
    url: 'https://example.test/recurring.json',
    format: 'json' as const,
    project: (document: unknown) => ({ title: (document as { title: string }).title }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: {
      ...first.observation,
      fingerprint: 'different-state',
    },
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.events.length, 1)
  assert.equal(second.events.length, 1)
  assert.equal(first.events[0]?.id, second.events[0]?.id)
})

test('feed observation emits normalized entry changes and suppresses quiet cycles', async () => {
  const feeds = [
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><item><guid>entry-1</guid><title>First</title><link>https://example.test/1</link><description>Hello</description><pubDate>Wed, 16 Apr 2026 18:00:00 GMT</pubDate></item></channel></rss>`,
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><item><guid>entry-1</guid><title>First</title><link>https://example.test/1</link><description>Hello</description><pubDate>Wed, 16 Apr 2026 18:00:00 GMT</pubDate></item></channel></rss>`,
  ]
  const adapter = new FeedObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () => new Response(feeds.shift(), { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
  })

  const target = {
    id: 'feed:rss:example',
    source: 'feed' as const,
    subject: 'feed:https://example.test/feed.xml',
    url: 'https://example.test/feed.xml',
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: first.observation,
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.events.length, 1)
  assert.equal(first.events[0]?.kind, 'feed.entry.changed')
  assert.deepEqual(first.events[0]?.payload, {
    url: 'https://example.test/feed.xml',
    entry: {
      id: 'entry-1',
      title: 'First',
      link: 'https://example.test/1',
      summary: 'Hello',
      content: undefined,
      author: undefined,
      categories: undefined,
      publishedAt: '2026-04-16T18:00:00.000Z',
      updatedAt: undefined,
    },
    projection: {
      id: 'entry-1',
      link: 'https://example.test/1',
      publishedAt: '2026-04-16T18:00:00.000Z',
      summary: 'Hello',
      title: 'First',
    },
  })
  assert.equal(second.events.length, 0)
  assert.ok(first.observation?.metadata?.entryFingerprints)
})

test('feed observation handles atom link attributes in arbitrary order and atom category term forms', async () => {
  const adapter = new FeedObservationAdapter({
    now: () => '2026-04-16T18:05:00.000Z',
    fetch: async () => new Response(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>One</title><author><name>Jane Example</name></author><summary>Atom summary</summary><link title="Example" hreflang="en" href="https://example.test/one" rel="alternate" /><updated>2026-04-16T18:00:00Z</updated><id>tag:example.test,2026:1</id><category term="ops" /><category term="platform">Platform</category></entry></feed>`, { status: 200 }),
  })

  const target = {
    id: 'feed:atom:attributes',
    source: 'feed' as const,
    subject: 'feed:https://example.test/atom.xml',
    url: 'https://example.test/atom.xml',
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const result = await adapter.poll(target)

  assert.equal(result.events.length, 1)
  const entryPayload = result.events[0]?.payload as { entry: unknown } | undefined
  assert.deepEqual((entryPayload?.entry as Record<string, unknown> | undefined), {
    id: 'tag:example.test,2026:1',
    title: 'One',
    link: 'https://example.test/one',
    summary: 'Atom summary',
    content: undefined,
    author: 'Jane Example',
    categories: ['ops', 'Platform'],
    publishedAt: undefined,
    updatedAt: '2026-04-16T18:00:00.000Z',
  })
})

test('feed observation re-emits when RSS content changes without timestamp changes even if projection omits body fields', async () => {
  const feeds = [
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><item><guid>entry-1</guid><title>Stable</title><link>https://example.test/1</link><description>Initial body</description><pubDate>Wed, 16 Apr 2026 18:00:00 GMT</pubDate></item></channel></rss>`,
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><item><guid>entry-1</guid><title>Stable</title><link>https://example.test/1</link><description>Updated body</description><pubDate>Wed, 16 Apr 2026 18:00:00 GMT</pubDate></item></channel></rss>`,
  ]
  const adapter = new FeedObservationAdapter({
    now: () => '2026-04-16T18:15:00.000Z',
    fetch: async () => new Response(feeds.shift(), { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
  })

  const target = {
    id: 'feed:rss:projection-stable',
    source: 'feed' as const,
    subject: 'feed:https://example.test/rss.xml',
    url: 'https://example.test/rss.xml',
    projectEntry: (entry: FeedEntrySnapshot) => ({ id: entry.id, title: entry.title }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: first.observation,
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.events.length, 1)
  assert.equal(second.events.length, 1)
  assert.notEqual(first.events[0]?.id, second.events[0]?.id)
  const firstPayload = first.events[0]?.payload as { projection: { title?: string } } | undefined
  const secondPayload = second.events[0]?.payload as { entry: { summary?: string; publishedAt?: string }; projection: { title?: string } } | undefined
  assert.deepEqual(firstPayload?.projection, secondPayload?.projection)
  assert.equal(secondPayload?.entry.summary, 'Updated body')
  assert.equal(secondPayload?.entry.publishedAt, '2026-04-16T18:00:00.000Z')
})

test('feed observation re-emits when entry version changes even if projection fingerprint is stable', async () => {
  const feeds = [
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:example.test,2026:1</id><title>Stable</title><summary>Initial body</summary><updated>2026-04-16T18:00:00Z</updated></entry></feed>`,
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:example.test,2026:1</id><title>Stable</title><summary>Updated body</summary><updated>2026-04-16T18:10:00Z</updated></entry></feed>`,
  ]
  const adapter = new FeedObservationAdapter({
    now: () => '2026-04-16T18:15:00.000Z',
    fetch: async () => new Response(feeds.shift(), { status: 200 }),
  })

  const target = {
    id: 'feed:atom:projection-stable',
    source: 'feed' as const,
    subject: 'feed:https://example.test/atom.xml',
    url: 'https://example.test/atom.xml',
    projectEntry: (entry: FeedEntrySnapshot) => ({ id: entry.id, title: entry.title }),
    dispatch: { kind: 'handler' as const, handler: async () => {} },
  }

  const first = await adapter.poll(target)
  const second = await adapter.poll(target, {
    observationTargetId: target.id,
    source: target.source,
    subject: target.subject,
    observation: first.observation,
    dispatchedEventIds: first.events.map((event) => event.id),
  })

  assert.equal(first.events.length, 1)
  assert.equal(second.events.length, 1)
  const firstPayload = first.events[0]?.payload as { entry: FeedEntrySnapshot; projection: { title?: string } } | undefined
  const secondPayload = second.events[0]?.payload as { entry: FeedEntrySnapshot; projection: { title?: string } } | undefined
  assert.equal(firstPayload?.projection.title, secondPayload?.projection.title)
  assert.notDeepEqual(firstPayload?.entry, secondPayload?.entry)
  assert.notEqual(first.events[0]?.id, second.events[0]?.id)
  assert.equal(secondPayload?.entry.summary, 'Updated body')
  assert.equal(secondPayload?.entry.updatedAt, '2026-04-16T18:10:00.000Z')
})

test('feed observation resumes compact entry fingerprint state after restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const checkpointPath = path.join(dir, 'checkpoints.json')
    const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title><entry><id>tag:example.test,2026:1</id><title>One</title><link href="https://example.test/one" rel="alternate" /><updated>2026-04-16T18:00:00Z</updated><summary>Atom summary</summary></entry></feed>`
    const runtime = new ObservationRuntime<any>({
      sourceAdapter: new FeedObservationAdapter({
        now: () => '2026-04-16T18:05:00.000Z',
        fetch: async () => new Response(feed, { status: 200 }),
      }),
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [new RecordingDispatchAdapter()],
    })

    const target = {
      id: 'feed:atom:example',
      source: 'feed' as const,
      subject: 'feed:https://example.test/atom.xml',
      url: 'https://example.test/atom.xml',
      dispatch: { kind: 'handler' as const, handler: async () => {} },
    }

    const first = await runtime.poll(target)
    const second = await runtime.poll(target)
    const stored = await new FileCheckpointStore(checkpointPath).read(target.id)
    const raw = await readFile(checkpointPath, 'utf8')

    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
    assert.ok(stored?.observation?.metadata?.entryFingerprints)
    assert.doesNotMatch(raw, /Atom summary/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('filesystem observation suppresses raw file churn when projection is unchanged', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const filePath = path.join(dir, 'status.json')
    await writeFile(filePath, JSON.stringify({ title: 'Stable', noisy: 1 }), 'utf8')

    const adapter = new FileSystemObservationAdapter({
      now: () => '2026-04-16T18:05:00.000Z',
    })

    const target = {
      id: 'filesystem:file:status',
      source: 'filesystem' as const,
      subject: `filesystem:${filePath}`,
      path: filePath,
      kind: 'file' as const,
      read: 'json' as const,
      project: (document: unknown) => ({ title: (document as { title: string }).title }),
      dispatch: { kind: 'handler' as const, handler: async () => {} },
    }

    const first = await adapter.poll(target)
    await writeFile(filePath, JSON.stringify({ title: 'Stable', noisy: 2 }), 'utf8')
    const second = await adapter.poll(target, {
      observationTargetId: target.id,
      source: target.source,
      subject: target.subject,
      observation: first.observation,
      dispatchedEventIds: first.events.map((event) => event.id),
    })

    assert.equal(first.events.length, 1)
    assert.equal(second.events.length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('filesystem observation exposes binary directory content as base64 when includeContent is enabled', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const watchDir = path.join(dir, 'watched')
    await mkdir(watchDir, { recursive: true })
    await writeFile(path.join(watchDir, 'blob.bin'), Buffer.from([0, 255, 1, 2]))

    const adapter = new FileSystemObservationAdapter({
      now: () => '2026-04-16T18:05:00.000Z',
    })

    const target = {
      id: 'filesystem:dir:binary',
      source: 'filesystem' as const,
      subject: `filesystem:${watchDir}`,
      path: watchDir,
      kind: 'directory' as const,
      includeContent: true,
      dispatch: { kind: 'handler' as const, handler: async () => {} },
    }

    const result = await adapter.poll(target)
    assert.equal(result.events.length, 1)
    const directoryPayload = result.events[0]?.payload as { projection: unknown } | undefined
    assert.deepEqual(directoryPayload?.projection, [{
      content: 'AP8BAg==',
      contentEncoding: 'base64',
      path: 'blob.bin',
      size: 4,
      type: 'file',
    }])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('filesystem observation persists compact restart-safe state for directories', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'starglass-'))
  try {
    const watchDir = path.join(dir, 'watched')
    await mkdir(watchDir, { recursive: true })
    await writeFile(path.join(watchDir, 'note.txt'), 'hello\n', 'utf8')

    const checkpointPath = path.join(dir, 'checkpoints.json')
    const runtime = new ObservationRuntime<any>({
      sourceAdapter: new FileSystemObservationAdapter({
        now: () => '2026-04-16T18:05:00.000Z',
      }),
      checkpointStore: new FileCheckpointStore(checkpointPath),
      dispatchAdapters: [new RecordingDispatchAdapter()],
    })

    const target = {
      id: 'filesystem:dir:notes',
      source: 'filesystem' as const,
      subject: `filesystem:${watchDir}`,
      path: watchDir,
      kind: 'directory' as const,
      recursive: true,
      projectEntry: (entry: { path: string; type: 'file' | 'directory' }) => ({ path: entry.path, type: entry.type }),
      dispatch: { kind: 'handler' as const, handler: async () => {} },
    }

    const first = await runtime.poll(target)
    const second = await runtime.poll(target)
    const raw = await readFile(checkpointPath, 'utf8')

    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
    assert.doesNotMatch(raw, /hello/)
    assert.ok((await new FileCheckpointStore(checkpointPath).read(target.id))?.observation?.fingerprint)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
