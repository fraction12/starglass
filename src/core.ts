import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type ObservationEventKind = string & {}

export type ObservationSource = string & {}

export interface SourceReference {
  provider: string
  type: string
  id: string
  url?: string | undefined
}

export interface ObservationEvent<TPayload = unknown> {
  id: string
  kind: ObservationEventKind
  source: ObservationSource
  subject: string
  occurredAt: string
  payload: TPayload
  sourceRef?: SourceReference
}

export interface CommandDispatchTarget {
  kind: 'command'
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface HandlerDispatchTarget {
  kind: 'handler'
  handler: (envelope: DispatchEnvelope) => Promise<void> | void
}

export type DispatchTarget = CommandDispatchTarget | HandlerDispatchTarget

export interface DispatchEnvelope<TPayload = unknown> {
  event: ObservationEvent<TPayload>
  target: DispatchTarget
  observationTargetId: string
  checkpointKey: string
}

export interface CheckpointRecord {
  observationTargetId: string
  source: string
  subject: string
  providerCursor?: string | undefined
  lastSuccessfulPollAt?: string | undefined
  dispatchedEventIds: string[]
}

export interface CheckpointStore {
  read(targetId: string): Promise<CheckpointRecord | undefined>
  write(record: CheckpointRecord): Promise<void>
}

export class CheckpointStateError extends Error {
  constructor(
    message: string,
    readonly filePath: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'CheckpointStateError'
  }
}

export class CorruptedCheckpointStateError extends CheckpointStateError {
  constructor(filePath: string, reason: string, options?: { cause?: unknown }) {
    super(`Checkpoint state at ${filePath} is corrupted or unreadable: ${reason}`, filePath, options)
    this.name = 'CorruptedCheckpointStateError'
  }
}

export interface SourcePollResult {
  events: ObservationEvent[]
  providerCursor?: string | undefined
  polledAt: string
}

export interface SourceAdapter<TTarget extends ObservationTarget = ObservationTarget> {
  source: string
  poll(target: TTarget, checkpoint?: CheckpointRecord): Promise<SourcePollResult>
}

export interface DispatchAdapter<TTarget extends DispatchTarget = DispatchTarget> {
  supports(target: DispatchTarget): target is TTarget
  dispatch(envelope: DispatchEnvelope, target: TTarget): Promise<void>
}

export interface ObservationTarget {
  id: string
  source: string
  subject: string
  dispatch: DispatchTarget
}

export interface PollStartedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
}

export interface PollCompletedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  polledAt: string
  eventCount: number
  dispatchedCount: number
  suppressedCount: number
  providerCursor?: string | undefined
}

export interface EventSuppressedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  event: ObservationEvent
  reason: 'duplicate'
}

export interface DispatchSucceededHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  event: ObservationEvent
  envelope: DispatchEnvelope
}

export interface DispatchFailedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  event: ObservationEvent
  envelope: DispatchEnvelope
  error: unknown
}

export interface CheckpointAdvancedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  record: CheckpointRecord
  reason: 'suppressed' | 'dispatched' | 'idle'
}

export interface WatchStartedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  intervalMs: number
}

export interface WatchCycleFailedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  error: unknown
  consecutiveFailures: number
}

export interface WatchBackoffHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  error: unknown
  consecutiveFailures: number
  delayMs: number
}

export interface WatchStoppedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  reason: 'stopped' | 'failed'
  error?: unknown
}

export interface RuntimeHooks<TTarget extends ObservationTarget = ObservationTarget> {
  onPollStarted?: (payload: PollStartedHookPayload<TTarget>) => void | Promise<void>
  onPollCompleted?: (payload: PollCompletedHookPayload<TTarget>) => void | Promise<void>
  onEventSuppressed?: (payload: EventSuppressedHookPayload<TTarget>) => void | Promise<void>
  onDispatchSucceeded?: (payload: DispatchSucceededHookPayload<TTarget>) => void | Promise<void>
  onDispatchFailed?: (payload: DispatchFailedHookPayload<TTarget>) => void | Promise<void>
  onCheckpointAdvanced?: (payload: CheckpointAdvancedHookPayload<TTarget>) => void | Promise<void>
  onWatchStarted?: (payload: WatchStartedHookPayload<TTarget>) => void | Promise<void>
  onWatchCycleFailed?: (payload: WatchCycleFailedHookPayload<TTarget>) => void | Promise<void>
  onWatchBackoff?: (payload: WatchBackoffHookPayload<TTarget>) => void | Promise<void>
  onWatchStopped?: (payload: WatchStoppedHookPayload<TTarget>) => void | Promise<void>
}

export interface WatchOptions {
  intervalMs: number
  backoffMs?: number
  maxBackoffMs?: number
  maxConsecutiveFailures?: number
}

export interface WatchController {
  stop(): Promise<void>
  readonly stopped: Promise<void>
}

export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly filePath: string) {}

  async read(targetId: string): Promise<CheckpointRecord | undefined> {
    const state = await this.readState()
    return state[targetId]
  }

  async write(record: CheckpointRecord): Promise<void> {
    const state = await this.readState()
    state[record.observationTargetId] = record
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await this.writeStateAtomically(state)
  }

  private async readState(): Promise<Record<string, CheckpointRecord>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return this.parseState(raw)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }
      throw this.wrapStateReadError(error)
    }
  }

  private parseState(raw: string): Record<string, CheckpointRecord> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new CorruptedCheckpointStateError(this.filePath, 'invalid JSON', { cause: error })
    }

    if (!isCheckpointStateRecord(parsed)) {
      throw new CorruptedCheckpointStateError(this.filePath, 'expected an object keyed by observation target id')
    }

    return parsed
  }

  private async writeStateAtomically(state: Record<string, CheckpointRecord>): Promise<void> {
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    const payload = `${JSON.stringify(state, null, 2)}\n`

    try {
      await fs.writeFile(tempPath, payload, 'utf8')
      await this.rename(tempPath, this.filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  protected async rename(fromPath: string, toPath: string): Promise<void> {
    await fs.rename(fromPath, toPath)
  }

  private wrapStateReadError(error: unknown): Error {
    if (error instanceof CheckpointStateError) {
      return error
    }

    const detail = error instanceof Error ? error.message : 'unknown read error'
    return new CorruptedCheckpointStateError(this.filePath, detail, { cause: error })
  }
}

function isCheckpointStateRecord(value: unknown): value is Record<string, CheckpointRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.entries(value).every(([targetId, record]) => isCheckpointRecord(targetId, record))
}

function isCheckpointRecord(targetId: string, value: unknown): value is CheckpointRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Partial<CheckpointRecord>
  return (
    record.observationTargetId === targetId &&
    typeof record.source === 'string' &&
    typeof record.subject === 'string' &&
    (record.providerCursor === undefined || typeof record.providerCursor === 'string') &&
    (record.lastSuccessfulPollAt === undefined || typeof record.lastSuccessfulPollAt === 'string') &&
    Array.isArray(record.dispatchedEventIds) &&
    record.dispatchedEventIds.every((eventId) => typeof eventId === 'string')
  )
}

export class CommandDispatchAdapter implements DispatchAdapter<CommandDispatchTarget> {
  supports(target: DispatchTarget): target is CommandDispatchTarget {
    return target.kind === 'command'
  }

  async dispatch(envelope: DispatchEnvelope, target: CommandDispatchTarget): Promise<void> {
    const payload = JSON.stringify(envelope)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(target.command, target.args ?? [], {
        cwd: target.cwd,
        env: { ...process.env, ...(target.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`Command dispatch failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
      })

      child.stdin.end(payload)
    })
  }
}

export class ObservationRuntime<TTarget extends ObservationTarget = ObservationTarget> {
  constructor(
    private readonly options: {
      sourceAdapter: SourceAdapter<TTarget>
      checkpointStore: CheckpointStore
      dispatchAdapters: DispatchAdapter[]
      hooks?: RuntimeHooks<TTarget>
    },
  ) {}

  async poll(target: TTarget): Promise<ObservationEvent[]> {
    return this.runPollCycle(target)
  }

  watch(target: TTarget, watchOptions: WatchOptions): WatchController {
    if (watchOptions.intervalMs <= 0) {
      throw new Error('Watch intervalMs must be greater than 0')
    }

    let stopRequested = false
    let timeout: NodeJS.Timeout | undefined
    let wakeWaiter: (() => void) | undefined

    const clearScheduled = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
      }
    }

    const wake = () => {
      if (wakeWaiter) {
        const resolve = wakeWaiter
        wakeWaiter = undefined
        resolve()
      }
    }

    const wait = (delayMs: number): Promise<void> => {
      if (delayMs <= 0) {
        return Promise.resolve()
      }

      return new Promise<void>((resolve) => {
        wakeWaiter = () => {
          clearScheduled()
          resolve()
        }
        timeout = setTimeout(() => {
          timeout = undefined
          wakeWaiter = undefined
          resolve()
        }, delayMs)
      })
    }

    const stopped = (async () => {
      await emitHook(this.options.hooks?.onWatchStarted, {
        target,
        intervalMs: watchOptions.intervalMs,
      })

      let consecutiveFailures = 0
      let stopReason: WatchStoppedHookPayload<TTarget>['reason'] = 'stopped'
      let stopError: unknown

      try {
        while (!stopRequested) {
          try {
            await this.runPollCycle(target)
            consecutiveFailures = 0
          } catch (error) {
            consecutiveFailures += 1
            await emitHook(this.options.hooks?.onWatchCycleFailed, {
              target,
              error,
              consecutiveFailures,
            })

            if (
              watchOptions.maxConsecutiveFailures !== undefined
              && consecutiveFailures >= watchOptions.maxConsecutiveFailures
            ) {
              stopReason = 'failed'
              stopError = error
              throw error
            }

            const delayMs = computeBackoffDelay(consecutiveFailures, watchOptions)
            await emitHook(this.options.hooks?.onWatchBackoff, {
              target,
              error,
              consecutiveFailures,
              delayMs,
            })

            await wait(delayMs)
            continue
          }

          if (stopRequested) {
            break
          }

          await wait(watchOptions.intervalMs)
        }
      } catch (error) {
        stopReason = 'failed'
        stopError = error
        throw error
      } finally {
        stopRequested = true
        clearScheduled()
        wake()
        await emitHook(this.options.hooks?.onWatchStopped, {
          target,
          reason: stopReason,
          ...(stopError !== undefined ? { error: stopError } : {}),
        })
      }
    })()

    return {
      stop: async () => {
        stopRequested = true
        clearScheduled()
        wake()
        await stopped.catch((error) => {
          throw error
        })
      },
      stopped,
    }
  }

  private async runPollCycle(target: TTarget): Promise<ObservationEvent[]> {
    await emitHook(this.options.hooks?.onPollStarted, { target })

    const checkpoint = await this.options.checkpointStore.read(target.id)
    const result = await this.options.sourceAdapter.poll(target, checkpoint)
    const dispatched: ObservationEvent[] = []
    const knownIds = new Set(checkpoint?.dispatchedEventIds ?? [])
    let suppressedCount = 0

    let latestRecord: CheckpointRecord = makeCheckpointRecord({
      observationTargetId: target.id,
      source: target.source,
      subject: target.subject,
      providerCursor: checkpoint?.providerCursor,
      lastSuccessfulPollAt: checkpoint?.lastSuccessfulPollAt,
      dispatchedEventIds: [...knownIds],
    })

    for (const event of result.events) {
      if (knownIds.has(event.id)) {
        suppressedCount += 1
        await emitHook(this.options.hooks?.onEventSuppressed, {
          target,
          event,
          reason: 'duplicate',
        })

        latestRecord = makeCheckpointRecord({
          ...latestRecord,
          providerCursor: result.providerCursor ?? latestRecord.providerCursor,
          lastSuccessfulPollAt: result.polledAt,
        })
        await this.options.checkpointStore.write(latestRecord)
        await emitHook(this.options.hooks?.onCheckpointAdvanced, {
          target,
          record: latestRecord,
          reason: 'suppressed',
        })
        continue
      }

      const adapter = this.options.dispatchAdapters.find((candidate) => candidate.supports(target.dispatch))
      if (!adapter) {
        throw new Error(`No dispatch adapter registered for target kind ${target.dispatch.kind}`)
      }

      const envelope: DispatchEnvelope = {
        event,
        target: target.dispatch,
        observationTargetId: target.id,
        checkpointKey: `${target.id}:${event.id}`,
      }

      try {
        await adapter.dispatch(envelope, target.dispatch)
      } catch (error) {
        await emitHook(this.options.hooks?.onDispatchFailed, {
          target,
          event,
          envelope,
          error,
        })
        throw error
      }

      await emitHook(this.options.hooks?.onDispatchSucceeded, {
        target,
        event,
        envelope,
      })

      knownIds.add(event.id)
      dispatched.push(event)
      latestRecord = makeCheckpointRecord({
        observationTargetId: target.id,
        source: target.source,
        subject: target.subject,
        providerCursor: result.providerCursor ?? latestRecord.providerCursor,
        lastSuccessfulPollAt: result.polledAt,
        dispatchedEventIds: [...knownIds],
      })
      await this.options.checkpointStore.write(latestRecord)
      await emitHook(this.options.hooks?.onCheckpointAdvanced, {
        target,
        record: latestRecord,
        reason: 'dispatched',
      })
    }

    if (result.events.length === 0) {
      latestRecord = makeCheckpointRecord({
        ...latestRecord,
        providerCursor: result.providerCursor ?? latestRecord.providerCursor,
        lastSuccessfulPollAt: result.polledAt,
      })
      await this.options.checkpointStore.write(latestRecord)
      await emitHook(this.options.hooks?.onCheckpointAdvanced, {
        target,
        record: latestRecord,
        reason: 'idle',
      })
    }

    await emitHook(this.options.hooks?.onPollCompleted, {
      target,
      polledAt: result.polledAt,
      eventCount: result.events.length,
      dispatchedCount: dispatched.length,
      suppressedCount,
      ...(result.providerCursor !== undefined ? { providerCursor: result.providerCursor } : {}),
    })

    return dispatched
  }
}

function computeBackoffDelay(consecutiveFailures: number, watchOptions: WatchOptions): number {
  const baseDelay = watchOptions.backoffMs ?? watchOptions.intervalMs
  const computed = baseDelay * 2 ** Math.max(0, consecutiveFailures - 1)
  const maxDelay = watchOptions.maxBackoffMs ?? computed
  return Math.min(computed, maxDelay)
}

async function emitHook<TPayload>(hook: ((payload: TPayload) => void | Promise<void>) | undefined, payload: TPayload): Promise<void> {
  await hook?.(payload)
}

export function stableEventId(...parts: Array<string | number | undefined | null>): string {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join(':')).digest('hex')
}

export function makeCheckpointRecord(input: {
  observationTargetId: string
  source: string
  subject: string
  providerCursor?: string | undefined
  lastSuccessfulPollAt?: string | undefined
  dispatchedEventIds: string[]
}): CheckpointRecord {
  return {
    observationTargetId: input.observationTargetId,
    source: input.source,
    subject: input.subject,
    ...(input.providerCursor !== undefined ? { providerCursor: input.providerCursor } : {}),
    ...(input.lastSuccessfulPollAt !== undefined ? { lastSuccessfulPollAt: input.lastSuccessfulPollAt } : {}),
    dispatchedEventIds: input.dispatchedEventIds,
  }
}

export function makePollResult(input: {
  events: ObservationEvent[]
  providerCursor?: string | undefined
  polledAt: string
}): SourcePollResult {
  return {
    events: input.events,
    ...(input.providerCursor !== undefined ? { providerCursor: input.providerCursor } : {}),
    polledAt: input.polledAt,
  }
}

export function eventIsNewerThanCursor(event: ObservationEvent, cursor?: string): boolean {
  if (!cursor) {
    return true
  }
  return event.occurredAt > cursor || event.occurredAt === cursor
}

export function defineEvent<TPayload>(event: ObservationEvent<TPayload>): ObservationEvent<TPayload> {
  return event
}

export function defineDispatch<TPayload>(envelope: DispatchEnvelope<TPayload>): DispatchEnvelope<TPayload> {
  return envelope
}
