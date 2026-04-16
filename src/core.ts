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

export type ObservationStrategyMode =
  | 'push'
  | 'conditional'
  | 'cursor'
  | 'probe-then-fetch'
  | 'projection-diff'
  | 'snapshot-diff'

export interface ObservationCapabilities {
  push?: boolean
  cursor?: boolean
  conditionalRequest?: boolean
  cheapProbe?: boolean
  projectionDiff?: boolean
  snapshotDiff?: boolean
}

export interface ObservationStrategy {
  mode: ObservationStrategyMode
  reason: string
}

export interface HttpValidators {
  etag?: string | undefined
  lastModified?: string | undefined
  retryAfterAt?: string | undefined
  nextPollAfter?: string | undefined
}

export interface ObservationCadenceState {
  idleStreak?: number | undefined
  currentDelayMs?: number | undefined
  lastReason?: CadenceReason | undefined
  lastPlannedAt?: string | undefined
  nextAttemptAt?: string | undefined
  lastObservedChangeAt?: string | undefined
}

export interface ObservationCheckpointState {
  strategy?: ObservationStrategy | undefined
  fingerprint?: string | undefined
  http?: HttpValidators | undefined
  cadence?: ObservationCadenceState | undefined
  metadata?: Record<string, string> | undefined
}

export interface CheckpointRecord {
  observationTargetId: string
  source: string
  subject: string
  providerCursor?: string | undefined
  lastSuccessfulPollAt?: string | undefined
  observation?: ObservationCheckpointState | undefined
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
  observation?: ObservationCheckpointState | undefined
}

export interface SourceAdapter<TTarget extends ObservationTarget = ObservationTarget> {
  source: string
  poll(target: TTarget, checkpoint?: CheckpointRecord): Promise<SourcePollResult>
  capabilities?(target: TTarget, checkpoint?: CheckpointRecord): ObservationCapabilities
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
  observationCapabilities?: ObservationCapabilities | undefined
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

export type CadenceReason = 'base' | 'activity' | 'idle' | 'retry-after' | 'cache-control' | 'failure-backoff'

export interface AdaptiveCadenceOptions {
  minIntervalMs?: number | undefined
  maxIntervalMs?: number | undefined
  activityMultiplier?: number | undefined
  idleMultiplier?: number | undefined
  maxIdleDelayMs?: number | undefined
}

export interface WatchCadenceHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  reason: CadenceReason
  delayMs: number
  previousDelayMs?: number | undefined
  nextAttemptAt: string
  plannedAt: string
  changed: boolean
  idleStreak: number
  consecutiveFailures: number
  boundedBy: 'min' | 'max' | 'none'
}

export interface ObservationPlanSelectedHookPayload<TTarget extends ObservationTarget = ObservationTarget> {
  target: TTarget
  strategy: ObservationStrategy
  capabilities: ObservationCapabilities
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
  onWatchCadencePlanned?: (payload: WatchCadenceHookPayload<TTarget>) => void | Promise<void>
  onWatchStopped?: (payload: WatchStoppedHookPayload<TTarget>) => void | Promise<void>
  onObservationPlanSelected?: (payload: ObservationPlanSelectedHookPayload<TTarget>) => void | Promise<void>
}

export interface WatchOptions {
  intervalMs: number
  backoffMs?: number
  maxBackoffMs?: number
  maxConsecutiveFailures?: number
  cadence?: AdaptiveCadenceOptions | undefined
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
    (record.observation === undefined || isObservationCheckpointState(record.observation)) &&
    Array.isArray(record.dispatchedEventIds) &&
    record.dispatchedEventIds.every((eventId) => typeof eventId === 'string')
  )
}

function isObservationCheckpointState(value: unknown): value is ObservationCheckpointState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const state = value as Partial<ObservationCheckpointState>
  return (
    (state.fingerprint === undefined || typeof state.fingerprint === 'string') &&
    (state.strategy === undefined || isObservationStrategy(state.strategy)) &&
    (state.http === undefined || isHttpValidators(state.http)) &&
    (state.metadata === undefined || isStringRecord(state.metadata))
  )
}

function isObservationStrategy(value: unknown): value is ObservationStrategy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const strategy = value as Partial<ObservationStrategy>
  return typeof strategy.mode === 'string' && typeof strategy.reason === 'string'
}

function isHttpValidators(value: unknown): value is HttpValidators {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const validators = value as Partial<HttpValidators>
  return (
    (validators.etag === undefined || typeof validators.etag === 'string') &&
    (validators.lastModified === undefined || typeof validators.lastModified === 'string') &&
    (validators.retryAfterAt === undefined || typeof validators.retryAfterAt === 'string') &&
    (validators.nextPollAfter === undefined || typeof validators.nextPollAfter === 'string')
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
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
          const checkpoint = await this.options.checkpointStore.read(target.id)

          try {
            const dispatched = await this.runPollCycle(target)
            consecutiveFailures = 0

            if (stopRequested) {
              break
            }

            const refreshedCheckpoint = await this.options.checkpointStore.read(target.id)
            const cadence = planAdaptiveCadence({
              ...(dispatched.length > 0
                ? { checkpoint: refreshedCheckpoint }
                : (checkpoint ?? refreshedCheckpoint) !== undefined
                  ? { checkpoint: checkpoint ?? refreshedCheckpoint }
                  : {}),
              watchOptions,
              dispatchedCount: dispatched.length,
              ...(refreshedCheckpoint?.lastSuccessfulPollAt !== undefined
                ? { plannedAt: refreshedCheckpoint.lastSuccessfulPollAt }
                : {}),
              consecutiveFailures,
            })

            await emitHook(this.options.hooks?.onWatchCadencePlanned, {
              target,
              ...cadence,
              consecutiveFailures,
            })

            if (cadence.changed || refreshedCheckpoint?.observation?.cadence === undefined) {
              await this.persistCadenceState(target.id, cadence, refreshedCheckpoint)
            }

            await wait(cadence.delayMs)
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

            const failureCadence = planAdaptiveCadence({
              ...(checkpoint !== undefined ? { checkpoint } : {}),
              watchOptions,
              dispatchedCount: 0,
              ...(checkpoint?.lastSuccessfulPollAt !== undefined
                ? { plannedAt: checkpoint.lastSuccessfulPollAt }
                : {}),
              consecutiveFailures,
              override: {
                delayMs,
                reason: 'failure-backoff',
              },
            })

            await emitHook(this.options.hooks?.onWatchCadencePlanned, {
              target,
              ...failureCadence,
              consecutiveFailures,
            })
            await this.persistCadenceState(target.id, failureCadence, checkpoint)

            await wait(delayMs)
            continue
          }
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
    const capabilities = mergeObservationCapabilities(target.observationCapabilities, this.options.sourceAdapter.capabilities?.(target, checkpoint))
    const strategy = selectObservationStrategy(capabilities)

    await emitHook(this.options.hooks?.onObservationPlanSelected, {
      target,
      strategy,
      capabilities,
    })

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
      observation: mergeObservationState(checkpoint?.observation, {
        strategy,
        cadence: {
          ...(checkpoint?.observation?.cadence?.lastObservedChangeAt !== undefined
            ? { lastObservedChangeAt: checkpoint.observation.cadence.lastObservedChangeAt }
            : {}),
        },
      }),
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
          observation: mergeObservationState(latestRecord.observation, result.observation, { strategy }),
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
        observation: mergeObservationState(latestRecord.observation, result.observation, {
          strategy,
          cadence: {
            idleStreak: 0,
            lastObservedChangeAt: result.polledAt,
          },
        }),
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
        observation: mergeObservationState(latestRecord.observation, result.observation, { strategy }),
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

  private async persistCadenceState(
    targetId: string,
    cadence: PlannedCadence,
    checkpoint?: CheckpointRecord,
  ): Promise<void> {
    const latestCheckpoint = checkpoint ?? await this.options.checkpointStore.read(targetId)
    if (!latestCheckpoint) {
      return
    }

    const persistedLastObservedChangeAt = latestCheckpoint.observation?.cadence?.lastObservedChangeAt
    const persistedHttp = pruneConsumedHttpHints(latestCheckpoint.observation?.http, cadence.plannedAt)
    const priorObservation = latestCheckpoint.observation
    const nextObservation: ObservationCheckpointState | undefined = {
      ...(priorObservation?.strategy !== undefined ? { strategy: priorObservation.strategy } : {}),
      ...(priorObservation?.fingerprint !== undefined ? { fingerprint: priorObservation.fingerprint } : {}),
      ...(persistedHttp !== undefined ? { http: persistedHttp } : {}),
      ...(priorObservation?.metadata !== undefined ? { metadata: priorObservation.metadata } : {}),
      cadence: {
        idleStreak: cadence.idleStreak,
        currentDelayMs: cadence.delayMs,
        lastReason: cadence.reason,
        lastPlannedAt: cadence.plannedAt,
        nextAttemptAt: cadence.nextAttemptAt,
        ...(persistedLastObservedChangeAt !== undefined
          ? { lastObservedChangeAt: persistedLastObservedChangeAt }
          : {}),
      },
    }

    const record = makeCheckpointRecord({
      ...latestCheckpoint,
      observation: Object.keys(nextObservation).length === 0 ? undefined : nextObservation,
    })

    await this.options.checkpointStore.write(record)
  }
}

export interface HttpTargetBase extends ObservationTarget {
  source: 'http'
  url: string
  method?: 'GET'
  headers?: Record<string, string>
}

export interface JsonHttpObservationTarget extends HttpTargetBase {
  format: 'json'
  project: (document: unknown) => unknown
}

export interface HtmlHttpObservationTarget extends HttpTargetBase {
  format: 'html'
  extract: (document: string) => unknown
}

export type HttpObservationTarget = JsonHttpObservationTarget | HtmlHttpObservationTarget

export interface HttpObservationOptions {
  fetch?: typeof fetch
  now?: () => string
}

export class HttpObservationAdapter implements SourceAdapter<HttpObservationTarget> {
  readonly source = 'http'
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string

  constructor(options: HttpObservationOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date().toISOString())
  }

  capabilities(target: HttpObservationTarget, checkpoint?: CheckpointRecord): ObservationCapabilities {
    const persistedValidators = checkpoint?.observation?.http
    const supportsConditional = hasValidatorHeaders(target.headers) || hasPersistedValidators(persistedValidators)

    return {
      ...(supportsConditional ? { conditionalRequest: true } : {}),
      projectionDiff: true,
      snapshotDiff: true,
      ...(target.format === 'json' ? {} : {}),
    }
  }

  async poll(target: HttpObservationTarget, checkpoint?: CheckpointRecord): Promise<SourcePollResult> {
    const headers = new Headers(target.headers ?? {})
    if (checkpoint?.observation?.http?.etag) {
      headers.set('if-none-match', checkpoint.observation.http.etag)
    }
    if (checkpoint?.observation?.http?.lastModified) {
      headers.set('if-modified-since', checkpoint.observation.http.lastModified)
    }

    const response = await this.fetchImpl(target.url, {
      method: target.method ?? 'GET',
      headers,
    })

    const polledAt = this.now()
    const strategy = selectObservationStrategy(this.capabilities(target, checkpoint))
    const validators = pickHttpValidators(response.headers, checkpoint?.observation?.http, polledAt)

    if (response.status === 304) {
      return makePollResult({
        events: [],
        polledAt,
        observation: {
          strategy,
          http: validators,
          fingerprint: checkpoint?.observation?.fingerprint,
        },
      })
    }

    if (!response.ok) {
      throw new Error(`HTTP observation failed with status ${response.status} for ${target.url}`)
    }

    const rawBody = await response.text()
    const projection = target.format === 'json'
      ? normalizeProjection(target.project(JSON.parse(rawBody)))
      : normalizeProjection(target.extract(rawBody))
    const fingerprint = stableFingerprint(projection)
    const previousFingerprint = checkpoint?.observation?.fingerprint

    if (previousFingerprint === fingerprint) {
      return makePollResult({
        events: [],
        polledAt,
        observation: {
          strategy,
          http: validators,
          fingerprint,
        },
      })
    }

    const event = defineEvent({
      id: stableEventId(target.subject, fingerprint),
      kind: 'http.changed',
      source: this.source,
      subject: target.subject,
      occurredAt: polledAt,
      payload: {
        url: target.url,
        format: target.format,
        projection,
      },
      sourceRef: {
        provider: 'http',
        type: target.format,
        id: target.url,
        url: target.url,
      },
    })

    return makePollResult({
      events: [event],
      polledAt,
      observation: {
        strategy,
        http: validators,
        fingerprint,
      },
    })
  }
}

function pickHttpValidators(headers: Headers, previous: HttpValidators | undefined, now: string): HttpValidators | undefined {
  const etag = headers.get('etag') ?? previous?.etag
  const lastModified = headers.get('last-modified') ?? previous?.lastModified
  const retryAfterAt = parseRetryAfter(headers.get('retry-after'), now) ?? previous?.retryAfterAt
  const nextPollAfter = parseCacheControlMaxAge(headers.get('cache-control'), now) ?? retryAfterAt ?? previous?.nextPollAfter

  if (!etag && !lastModified && !retryAfterAt && !nextPollAfter) {
    return undefined
  }

  return {
    ...(etag !== undefined ? { etag } : {}),
    ...(lastModified !== undefined ? { lastModified } : {}),
    ...(retryAfterAt !== undefined ? { retryAfterAt } : {}),
    ...(nextPollAfter !== undefined ? { nextPollAfter } : {}),
  }
}

function parseRetryAfter(value: string | null, now: string): string | undefined {
  if (!value) {
    return undefined
  }

  const deltaSeconds = Number(value)
  if (Number.isFinite(deltaSeconds)) {
    return new Date(Date.parse(now) + Math.max(0, deltaSeconds) * 1000).toISOString()
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function parseCacheControlMaxAge(value: string | null, now: string): string | undefined {
  if (!value) {
    return undefined
  }

  const match = value.match(/(?:^|,)\s*max-age=(\d+)\b/i)
  if (!match) {
    return undefined
  }

  return new Date(Date.parse(now) + Number(match[1]) * 1000).toISOString()
}

function hasValidatorHeaders(headers?: Record<string, string>): boolean {
  if (!headers) {
    return false
  }

  return Object.keys(headers).some((key) => {
    const normalized = key.toLowerCase()
    return normalized === 'if-none-match' || normalized === 'if-modified-since'
  })
}

function hasPersistedValidators(validators?: HttpValidators): boolean {
  return Boolean(validators?.etag || validators?.lastModified)
}

function normalizeProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeProjection(entry))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeProjection((value as Record<string, unknown>)[key])
        return accumulator
      }, {})
  }

  return value
}

function stableFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function mergeObservationCapabilities(
  targetCapabilities?: ObservationCapabilities,
  adapterCapabilities?: ObservationCapabilities,
): ObservationCapabilities {
  return {
    ...(targetCapabilities ?? {}),
    ...(adapterCapabilities ?? {}),
  }
}

export function selectObservationStrategy(capabilities: ObservationCapabilities): ObservationStrategy {
  if (capabilities.push) {
    return { mode: 'push', reason: 'push delivery available' }
  }
  if (capabilities.conditionalRequest) {
    return { mode: 'conditional', reason: 'conditional requests available' }
  }
  if (capabilities.cursor) {
    return { mode: 'cursor', reason: 'incremental cursor available' }
  }
  if (capabilities.cheapProbe) {
    return { mode: 'probe-then-fetch', reason: 'cheap probe available before full fetch' }
  }
  if (capabilities.projectionDiff) {
    return { mode: 'projection-diff', reason: 'normalized projection diff available' }
  }
  return { mode: 'snapshot-diff', reason: 'falling back to snapshot diff' }
}

export function mergeObservationState(...states: Array<ObservationCheckpointState | undefined>): ObservationCheckpointState | undefined {
  const merged: ObservationCheckpointState = {}

  for (const state of states) {
    if (!state) {
      continue
    }

    if (state.strategy) {
      merged.strategy = state.strategy
    }
    if (state.fingerprint !== undefined) {
      merged.fingerprint = state.fingerprint
    }
    if (state.http) {
      merged.http = {
        ...(merged.http ?? {}),
        ...state.http,
      }
    }
    if (state.cadence) {
      merged.cadence = {
        ...(merged.cadence ?? {}),
        ...state.cadence,
      }
    }
    if (state.metadata) {
      merged.metadata = {
        ...(merged.metadata ?? {}),
        ...state.metadata,
      }
    }
  }

  return Object.keys(merged).length === 0 ? undefined : merged
}

interface AdaptiveCadencePlanInput {
  checkpoint?: CheckpointRecord | undefined
  watchOptions: WatchOptions
  dispatchedCount: number
  plannedAt?: string | undefined
  consecutiveFailures: number
  override?: {
    delayMs: number
    reason: CadenceReason
  } | undefined
}

interface PlannedCadence {
  reason: CadenceReason
  delayMs: number
  previousDelayMs?: number | undefined
  nextAttemptAt: string
  plannedAt: string
  changed: boolean
  idleStreak: number
  boundedBy: 'min' | 'max' | 'none'
}

function planAdaptiveCadence(input: AdaptiveCadencePlanInput): PlannedCadence {
  const cadenceState = input.checkpoint?.observation?.cadence
  const plannedAt = input.plannedAt ?? new Date().toISOString()
  const previousDelayMs = cadenceState?.currentDelayMs
  const bounds = resolveCadenceBounds(input.watchOptions)

  let idleStreak = input.dispatchedCount > 0 ? 0 : (cadenceState?.idleStreak ?? 0) + 1
  let candidateDelayMs = input.watchOptions.intervalMs
  let reason: CadenceReason = 'base'

  if (input.override) {
    candidateDelayMs = input.override.delayMs
    reason = input.override.reason
    idleStreak = cadenceState?.idleStreak ?? 0
  } else {
    const retryAfterDelayMs = computeHintDelayMs(input.checkpoint?.observation?.http?.retryAfterAt, plannedAt)
    const nextPollDelayMs = computeHintDelayMs(input.checkpoint?.observation?.http?.nextPollAfter, plannedAt)

    if (input.dispatchedCount > 0) {
      candidateDelayMs = Math.round(input.watchOptions.intervalMs * (input.watchOptions.cadence?.activityMultiplier ?? 0.5))
      reason = 'activity'
    } else if (retryAfterDelayMs !== undefined) {
      candidateDelayMs = retryAfterDelayMs
      reason = 'retry-after'
    } else if (nextPollDelayMs !== undefined) {
      candidateDelayMs = nextPollDelayMs
      reason = 'cache-control'
    } else if (idleStreak > 1) {
      const idleMultiplier = input.watchOptions.cadence?.idleMultiplier ?? 1.5
      const previous = previousDelayMs ?? input.watchOptions.intervalMs
      candidateDelayMs = Math.round(previous * idleMultiplier)
      reason = 'idle'
    }
  }

  if (input.watchOptions.cadence?.maxIdleDelayMs !== undefined && reason === 'idle') {
    candidateDelayMs = Math.min(candidateDelayMs, input.watchOptions.cadence.maxIdleDelayMs)
  }

  const bounded = boundCadenceDelay(candidateDelayMs, bounds)
  const nextAttemptAt = new Date(Date.parse(plannedAt) + bounded.delayMs).toISOString()

  return {
    reason,
    delayMs: bounded.delayMs,
    previousDelayMs,
    nextAttemptAt,
    plannedAt,
    changed: previousDelayMs !== bounded.delayMs || cadenceState?.lastReason !== reason,
    idleStreak,
    boundedBy: bounded.boundedBy,
  }
}

function resolveCadenceBounds(watchOptions: WatchOptions): { minDelayMs: number; maxDelayMs: number } {
  const configuredMin = watchOptions.cadence?.minIntervalMs ?? watchOptions.intervalMs
  const configuredMax = watchOptions.cadence?.maxIntervalMs ?? watchOptions.maxBackoffMs ?? watchOptions.intervalMs
  return {
    minDelayMs: Math.max(1, Math.min(configuredMin, configuredMax)),
    maxDelayMs: Math.max(configuredMin, configuredMax),
  }
}

function boundCadenceDelay(delayMs: number, bounds: { minDelayMs: number; maxDelayMs: number }): { delayMs: number; boundedBy: 'min' | 'max' | 'none' } {
  if (delayMs < bounds.minDelayMs) {
    return { delayMs: bounds.minDelayMs, boundedBy: 'min' }
  }
  if (delayMs > bounds.maxDelayMs) {
    return { delayMs: bounds.maxDelayMs, boundedBy: 'max' }
  }
  return { delayMs, boundedBy: 'none' }
}

function computeHintDelayMs(isoTime: string | undefined, now: string): number | undefined {
  if (!isoTime) {
    return undefined
  }

  const delta = Date.parse(isoTime) - Date.parse(now)
  if (Number.isNaN(delta) || delta <= 0) {
    return undefined
  }

  return delta
}

function pruneConsumedHttpHints(validators: HttpValidators | undefined, now: string): HttpValidators | undefined {
  if (!validators) {
    return undefined
  }

  const next = {
    ...(validators.etag !== undefined ? { etag: validators.etag } : {}),
    ...(validators.lastModified !== undefined ? { lastModified: validators.lastModified } : {}),
    ...(isFutureIsoTime(validators.retryAfterAt, now) ? { retryAfterAt: validators.retryAfterAt } : {}),
    ...(isFutureIsoTime(validators.nextPollAfter, now) ? { nextPollAfter: validators.nextPollAfter } : {}),
  }

  return Object.keys(next).length === 0 ? undefined : next
}

function isFutureIsoTime(value: string | undefined, now: string): value is string {
  if (!value) {
    return false
  }

  const delta = Date.parse(value) - Date.parse(now)
  return !Number.isNaN(delta) && delta > 0
}

function computeBackoffDelay(consecutiveFailures: number, watchOptions: WatchOptions): number {
  const baseDelay = watchOptions.backoffMs ?? watchOptions.intervalMs
  const computed = baseDelay * 2 ** Math.max(0, consecutiveFailures - 1)
  const maxDelay = watchOptions.maxBackoffMs ?? resolveCadenceBounds(watchOptions).maxDelayMs
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
  observation?: ObservationCheckpointState | undefined
  dispatchedEventIds: string[]
}): CheckpointRecord {
  return {
    observationTargetId: input.observationTargetId,
    source: input.source,
    subject: input.subject,
    ...(input.providerCursor !== undefined ? { providerCursor: input.providerCursor } : {}),
    ...(input.lastSuccessfulPollAt !== undefined ? { lastSuccessfulPollAt: input.lastSuccessfulPollAt } : {}),
    ...(input.observation !== undefined ? { observation: input.observation } : {}),
    dispatchedEventIds: input.dispatchedEventIds,
  }
}

export function makePollResult(input: {
  events: ObservationEvent[]
  providerCursor?: string | undefined
  polledAt: string
  observation?: ObservationCheckpointState | undefined
}): SourcePollResult {
  return {
    events: input.events,
    ...(input.providerCursor !== undefined ? { providerCursor: input.providerCursor } : {}),
    ...(input.observation !== undefined ? { observation: input.observation } : {}),
    polledAt: input.polledAt,
  }
}

export function eventIsNewerThanCursor(event: ObservationEvent | { occurredAt: string }, cursor?: string): boolean {
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
