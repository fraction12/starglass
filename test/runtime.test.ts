import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  CommandDispatchAdapter,
  CorruptedCheckpointStateError,
  FileCheckpointStore,
  ObservationRuntime,
  defineEvent,
  eventIsNewerThanCursor,
  stableEventId,
  type CheckpointRecord,
  type DispatchAdapter,
  type DispatchEnvelope,
  type DispatchTarget,
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
    onWatchStopped: ({ reason }) => {
      log.push(`watch-stop:${reason}`)
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
          dispatchedEventIds: ['evt-1', 'evt-2'],
        }),
      /rename exploded/,
    )

    const after = await readFile(checkpointPath, 'utf8')
    assert.equal(after, before)

    const persisted = await new FileCheckpointStore(checkpointPath).read('target-a')
    assert.equal(persisted?.providerCursor, 'cursor-1')
    assert.deepEqual(persisted?.dispatchedEventIds, ['evt-1'])
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

    const controller = runtime.watch(makeTarget(), { intervalMs: 5 })

    await new Promise((resolve) => setTimeout(resolve, 30))
    await controller.stop()

    assert.ok(sourceAdapter['index'] >= 2)
    assert.equal(dispatch.envelopes.length, 2)
    assert.ok(log.includes('watch-start:target-a:5'))
    assert.ok(log.includes('watch-stop:stopped'))
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

    const controller = runtime.watch(makeTarget(), { intervalMs: 5, backoffMs: 7, maxBackoffMs: 20 })
    await new Promise((resolve) => setTimeout(resolve, 35))
    await controller.stop()

    assert.ok(sourceAdapter.calls >= 2)
    assert.ok(log.includes('watch-failed:1:poll failed 1'))
    assert.ok(log.includes('watch-backoff:1:7'))
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
    })

    await assert.rejects(() => controller.stopped, /poll failed 2/)
    assert.ok(log.includes('watch-failed:1:poll failed 1'))
    assert.ok(log.includes('watch-failed:2:poll failed 2'))
    assert.ok(log.includes('watch-stop:failed'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runtime emits suppression, dispatch failure, and checkpoint hooks for one-shot poll', async () => {
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
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
