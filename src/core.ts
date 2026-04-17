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

export type ObservationPlanChangeKind = 'initial' | 'unchanged' | 'upgraded' | 'degraded'

export interface ObservationPlanInputs {
  target: ObservationCapabilities
  adapter: ObservationCapabilities
  resumedFromCheckpoint: boolean
}

export interface ObservationPlan {
  strategy: ObservationStrategy
  capabilities: ObservationCapabilities
  previousStrategy?: ObservationStrategy | undefined
  change: {
    kind: ObservationPlanChangeKind
    reason: string
  }
  inputs: ObservationPlanInputs
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
  plan?: ObservationPlan | undefined
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
  plan: ObservationPlan
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
  onWatchCadencePlanned?: (payload: WatchCadenceHookPayload<TTarget>) => void | Promise<void>
  onObservationPlanSelected?: (payload: ObservationPlanSelectedHookPayload<TTarget>) => void | Promise<void>
}

export interface WatchOptions {
  intervalMs: number
  backoffMs?: number | undefined
  maxBackoffMs?: number | undefined
  maxConsecutiveFailures?: number | undefined
  cadence?: AdaptiveCadenceOptions | undefined
}

export interface WatchController {
  stop(): Promise<void>
  stopped: Promise<void>
}

export class CommandDispatchAdapter implements DispatchAdapter<CommandDispatchTarget> {
  supports(target: DispatchTarget): target is CommandDispatchTarget {
    return target.kind === 'command'
  }

  async dispatch(envelope: DispatchEnvelope, target: CommandDispatchTarget): Promise<void> {
    const child = spawn(target.command, target.args ?? [], {
      cwd: target.cwd,
      env: {
        ...process.env,
        ...(target.env ?? {}),
      },
      stdio: ['pipe', 'inherit', 'inherit'],
    })

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Command dispatch exited with code ${code ?? 'unknown'}`))
        }
      })
      child.stdin.end(`${JSON.stringify(envelope)}\n`)
    })
  }
}

export class FileCheckpointStore implements CheckpointStore {
  private readonly directory: string

  constructor(readonly filePath: string) {
    this.directory = path.dirname(filePath)
  }

  async read(targetId: string): Promise<CheckpointRecord | undefined> {
    const state = await this.readAll()
    return state[targetId]
  }

  async write(record: CheckpointRecord): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const current = await this.readAll()
    current[record.observationTargetId] = record

    const tempPath = path.join(this.directory, `${path.basename(this.filePath)}.${randomUUID()}.tmp`)
    await fs.writeFile(tempPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')

    try {
      await this.rename(tempPath, this.filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {})
      throw error
    }
  }

  protected async rename(from?: string, to?: string): Promise<void> {
    if (!from || !to) {
      return
    }
    await fs.rename(from, to)
  }

  private async readAll(): Promise<Record<string, CheckpointRecord>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      return this.validateState(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return {}
      }
      if (error instanceof CorruptedCheckpointStateError) {
        throw error
      }
      if (error instanceof SyntaxError) {
        throw new CorruptedCheckpointStateError(this.filePath, 'invalid JSON', { cause: error })
      }
      throw new CorruptedCheckpointStateError(this.filePath, 'unexpected read failure', { cause: error })
    }
  }

  private validateState(value: unknown): Record<string, CheckpointRecord> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new CorruptedCheckpointStateError(this.filePath, 'expected an object keyed by observation target id')
    }

    const state = value as Record<string, unknown>
    const validated: Record<string, CheckpointRecord> = {}

    for (const [key, record] of Object.entries(state)) {
      if (!isCheckpointRecord(record, key)) {
        throw new CorruptedCheckpointStateError(this.filePath, 'expected an object keyed by observation target id')
      }
      validated[key] = record
    }

    return validated
  }
}

function isCheckpointRecord(value: unknown, targetId: string): value is CheckpointRecord {
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
    record.dispatchedEventIds.every((eventId) => typeof eventId === 'string') &&
    (record.observation === undefined || isObservationCheckpointState(record.observation))
  )
}

function isObservationCheckpointState(value: unknown): value is ObservationCheckpointState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const state = value as Partial<ObservationCheckpointState>
  return (
    (state.strategy === undefined || isObservationStrategy(state.strategy)) &&
    (state.plan === undefined || isObservationPlan(state.plan)) &&
    (state.http === undefined || isHttpValidators(state.http)) &&
    (state.cadence === undefined || isObservationCadenceState(state.cadence)) &&
    (state.fingerprint === undefined || typeof state.fingerprint === 'string') &&
    (state.metadata === undefined || isStringMap(state.metadata))
  )
}

function isObservationPlan(value: unknown): value is ObservationPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const plan = value as Partial<ObservationPlan>
  return (
    isObservationStrategy(plan.strategy) &&
    isObservationCapabilities(plan.capabilities) &&
    (plan.previousStrategy === undefined || isObservationStrategy(plan.previousStrategy)) &&
    isObservationPlanChange(plan.change) &&
    isObservationPlanInputs(plan.inputs)
  )
}

function isObservationCapabilities(value: unknown): value is ObservationCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'boolean')
}

function isObservationPlanChange(value: unknown): value is ObservationPlan['change'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const change = value as Partial<ObservationPlan['change']>
  return isObservationPlanChangeKind(change.kind) && typeof change.reason === 'string'
}

function isObservationPlanChangeKind(value: unknown): value is ObservationPlanChangeKind {
  return value === 'initial' || value === 'unchanged' || value === 'upgraded' || value === 'degraded'
}

function isObservationPlanInputs(value: unknown): value is ObservationPlanInputs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const inputs = value as Partial<ObservationPlanInputs>
  return (
    isObservationCapabilities(inputs.target) &&
    isObservationCapabilities(inputs.adapter) &&
    typeof inputs.resumedFromCheckpoint === 'boolean'
  )
}

function isObservationStrategy(value: unknown): value is ObservationStrategy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const strategy = value as Partial<ObservationStrategy>
  return isObservationStrategyMode(strategy.mode) && typeof strategy.reason === 'string'
}

function isObservationStrategyMode(value: unknown): value is ObservationStrategyMode {
  return value === 'push'
    || value === 'conditional'
    || value === 'cursor'
    || value === 'probe-then-fetch'
    || value === 'projection-diff'
    || value === 'snapshot-diff'
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

function isObservationCadenceState(value: unknown): value is ObservationCadenceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const cadence = value as Partial<ObservationCadenceState>
  return (
    (cadence.idleStreak === undefined || typeof cadence.idleStreak === 'number') &&
    (cadence.currentDelayMs === undefined || typeof cadence.currentDelayMs === 'number') &&
    (cadence.lastReason === undefined || isCadenceReason(cadence.lastReason)) &&
    (cadence.lastPlannedAt === undefined || typeof cadence.lastPlannedAt === 'string') &&
    (cadence.nextAttemptAt === undefined || typeof cadence.nextAttemptAt === 'string') &&
    (cadence.lastObservedChangeAt === undefined || typeof cadence.lastObservedChangeAt === 'string')
  )
}

function isCadenceReason(value: unknown): value is CadenceReason {
  return value === 'base'
    || value === 'activity'
    || value === 'idle'
    || value === 'retry-after'
    || value === 'cache-control'
    || value === 'failure-backoff'
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string')
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
    const targetCapabilities = target.observationCapabilities ?? {}
    const adapterCapabilities = this.options.sourceAdapter.capabilities?.(target, checkpoint) ?? {}
    const plan = resolveObservationPlan(targetCapabilities, adapterCapabilities, checkpoint)
    const strategy = plan.strategy

    await emitHook(this.options.hooks?.onObservationPlanSelected, {
      target,
      plan,
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
        plan,
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
          observation: mergeObservationState(latestRecord.observation, result.observation, { strategy, plan }),
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
          plan,
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
        observation: mergeObservationState(latestRecord.observation, result.observation, { strategy, plan }),
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
      ...(priorObservation?.plan !== undefined ? { plan: priorObservation.plan } : {}),
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

export type JsonProjection = (document: unknown) => unknown
export type HtmlExtractionProjector = (document: string) => unknown

const HTML_EXTRACTION_SENTINEL = '__starglassHtmlExtraction'

export interface HtmlExtraction {
  projection: unknown
  [HTML_EXTRACTION_SENTINEL]: true
}

export type HtmlExtractionResult = unknown | HtmlExtraction
export type HtmlProjection = (document: string) => HtmlExtractionResult

export interface JsonHttpObservationTarget extends HttpTargetBase {
  format: 'json'
  project: JsonProjection
}

export interface HtmlHttpObservationTarget extends HttpTargetBase {
  format: 'html'
  extract: HtmlProjection
}

export type HttpObservationTarget = JsonHttpObservationTarget | HtmlHttpObservationTarget

export interface HttpObservationOptions {
  fetch?: typeof fetch
  now?: () => string
}

export const projectJson = {
  pick: <TDocument extends Record<string, unknown>, const TKeys extends readonly (keyof TDocument)[]>(...keys: TKeys) =>
    (document: unknown): Pick<TDocument, TKeys[number]> => {
      const record = asRecord(document)
      return keys.reduce((projection, key) => {
        projection[key] = record[key as string] as TDocument[TKeys[number]]
        return projection
      }, {} as Pick<TDocument, TKeys[number]>)
    },
  path: (...pathSegments: readonly (string | number)[]) =>
    (document: unknown): unknown => getPath(document, pathSegments),
  shape: <TShape extends Record<string, JsonProjection>>(shape: TShape) =>
    (document: unknown): { [TKey in keyof TShape]: ReturnType<TShape[TKey]> } => {
      return Object.keys(shape).reduce((projection, key) => {
        const projector = shape[key] as JsonProjection
        ;(projection as Record<string, unknown>)[key] = projector(document)
        return projection
      }, {} as { [TKey in keyof TShape]: ReturnType<TShape[TKey]> })
    },
}

export const normalize = Object.freeze({
  projection: normalizeProjection,
  stable: normalizeProjection,
})

export const html = {
  extract: (project: HtmlExtractionProjector) => (document: string): HtmlExtraction => ({
    projection: project(document),
    [HTML_EXTRACTION_SENTINEL]: true,
  }),
}

export interface FeedTargetBase extends ObservationTarget {
  source: 'feed'
  url: string
  headers?: Record<string, string>
}

export interface FeedEntrySnapshot {
  id: string
  title?: string | undefined
  link?: string | undefined
  summary?: string | undefined
  content?: string | undefined
  author?: string | undefined
  categories?: string[] | undefined
  publishedAt?: string | undefined
  updatedAt?: string | undefined
}

export type FeedProjection = (entry: FeedEntrySnapshot) => unknown

export interface FeedObservationTarget extends FeedTargetBase {
  projectEntry?: FeedProjection | undefined
  entryVersion?: ((entry: FeedEntrySnapshot) => string | number | boolean | null | undefined) | undefined
}

export interface FeedObservationOptions {
  fetch?: typeof fetch
  now?: () => string
}

interface FeedEntryState {
  version: string
  fingerprint: string
}

export interface FileSystemTargetBase extends ObservationTarget {
  source: 'filesystem'
  path: string
}

export interface FileSystemFileObservationTarget extends FileSystemTargetBase {
  kind: 'file'
  read?: 'text' | 'json' | 'bytes' | undefined
  project?: ((input: string | Uint8Array | unknown) => unknown) | undefined
}

export interface FileSystemDirectoryEntrySnapshot {
  path: string
  type: 'file' | 'directory'
  size?: number | undefined
  content?: string | unknown | undefined
  contentEncoding?: 'utf8' | 'base64' | undefined
}

export interface FileSystemDirectoryObservationTarget extends FileSystemTargetBase {
  kind: 'directory'
  recursive?: boolean | undefined
  includeContent?: boolean | undefined
  projectEntry?: ((entry: FileSystemDirectoryEntrySnapshot) => unknown) | undefined
}

interface EncodedFileContent {
  value: string
  encoding: 'utf8' | 'base64'
}

export type FileSystemObservationTarget = FileSystemFileObservationTarget | FileSystemDirectoryObservationTarget

export interface FileSystemObservationOptions {
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
    const plan = resolveObservationPlan(target.observationCapabilities, this.capabilities(target, checkpoint), checkpoint)
    const strategy = plan.strategy
    const validators = pickHttpValidators(response.headers, checkpoint?.observation?.http, polledAt)

    if (response.status === 304) {
      return makePollResult({
        events: [],
        polledAt,
        observation: {
          strategy,
          plan,
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
      : normalizeProjection(resolveHtmlExtraction(target.extract(rawBody)).projection)
    const fingerprint = stableFingerprint(projection)
    const previousFingerprint = checkpoint?.observation?.fingerprint

    if (previousFingerprint === fingerprint) {
      return makePollResult({
        events: [],
        polledAt,
        observation: {
          strategy,
          plan,
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
        plan,
        http: validators,
        fingerprint,
      },
    })
  }
}

export class FeedObservationAdapter implements SourceAdapter<FeedObservationTarget> {
  readonly source = 'feed'
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string

  constructor(options: FeedObservationOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date().toISOString())
  }

  capabilities(_target?: FeedObservationTarget, _checkpoint?: CheckpointRecord): ObservationCapabilities {
    return {
      projectionDiff: true,
      snapshotDiff: true,
    }
  }

  async poll(target: FeedObservationTarget, checkpoint?: CheckpointRecord): Promise<SourcePollResult> {
    const response = await this.fetchImpl(target.url, {
      method: 'GET',
      headers: new Headers(target.headers ?? {}),
    })

    if (!response.ok) {
      throw new Error(`Feed observation failed with status ${response.status} for ${target.url}`)
    }

    const polledAt = this.now()
    const plan = resolveObservationPlan(target.observationCapabilities, this.capabilities(target, checkpoint), checkpoint)
    const strategy = plan.strategy
    const xml = await response.text()
    const entries = parseFeedEntries(xml).map((entry) => ({
      ...entry,
      categories: entry.categories ? [...entry.categories] : undefined,
    }))

    const previousMap = decodeFeedEntryStateMap(checkpoint?.observation?.metadata?.entryFingerprints)
    const nextMap = new Map<string, FeedEntryState>()
    const events: ObservationEvent[] = []

    for (const entry of entries) {
      const projection = normalizeProjection((target.projectEntry ?? defaultFeedEntryProjection)(entry))
      const fingerprint = stableFingerprint(projection)
      const version = resolveFeedEntryVersion(entry, target.entryVersion)
      const contentFingerprint = feedEntryContentFingerprint(entry)
      const revision = resolveFeedEntryRevision(version, contentFingerprint)
      nextMap.set(entry.id, { version, fingerprint: contentFingerprint })

      const previous = previousMap.get(entry.id)
      if (previous && previous.version === version && previous.fingerprint === contentFingerprint) {
        continue
      }

      const occurredAt = entry.updatedAt ?? entry.publishedAt ?? polledAt
      events.push(defineEvent({
        id: stableEventId(target.subject, entry.id, revision),
        kind: 'feed.entry.changed',
        source: this.source,
        subject: target.subject,
        occurredAt,
        payload: {
          url: target.url,
          entry,
          projection,
        },
        sourceRef: {
          provider: 'feed',
          type: 'entry',
          id: entry.id,
          url: entry.link ?? target.url,
        },
      }))
    }

    events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))

    return makePollResult({
      events,
      polledAt,
      observation: {
        strategy,
        plan,
        fingerprint: stableFingerprint(serializeFeedEntryStateMap(nextMap)),
        metadata: {
          entryFingerprints: serializeFeedEntryStateMap(nextMap),
        },
      },
    })
  }
}

export class FileSystemObservationAdapter implements SourceAdapter<FileSystemObservationTarget> {
  readonly source = 'filesystem'
  private readonly now: () => string

  constructor(options: FileSystemObservationOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  capabilities(_target?: FileSystemObservationTarget, _checkpoint?: CheckpointRecord): ObservationCapabilities {
    return {
      projectionDiff: true,
      snapshotDiff: true,
    }
  }

  async poll(target: FileSystemObservationTarget, checkpoint?: CheckpointRecord): Promise<SourcePollResult> {
    const polledAt = this.now()
    const plan = resolveObservationPlan(target.observationCapabilities, this.capabilities(target, checkpoint), checkpoint)
    const strategy = plan.strategy

    const projection = target.kind === 'file'
      ? await observeFileTarget(target)
      : await observeDirectoryTarget(target)
    const normalizedProjection = normalizeProjection(projection)
    const fingerprint = stableFingerprint(normalizedProjection)

    if (checkpoint?.observation?.fingerprint === fingerprint) {
      return makePollResult({
        events: [],
        polledAt,
        observation: {
          strategy,
          plan,
          fingerprint,
        },
      })
    }

    const event = defineEvent({
      id: stableEventId(target.subject, fingerprint),
      kind: target.kind === 'file' ? 'filesystem.file.changed' : 'filesystem.directory.changed',
      source: this.source,
      subject: target.subject,
      occurredAt: polledAt,
      payload: {
        path: target.path,
        kind: target.kind,
        projection: normalizedProjection,
      },
      sourceRef: {
        provider: 'filesystem',
        type: target.kind,
        id: target.path,
      },
    })

    return makePollResult({
      events: [event],
      polledAt,
      observation: {
        strategy,
        plan,
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object projection source')
  }

  return value as Record<string, unknown>
}

function getPath(value: unknown, pathSegments: readonly (string | number)[]): unknown {
  return pathSegments.reduce((current, segment) => {
    if (typeof segment === 'number') {
      return Array.isArray(current) ? current[segment] : undefined
    }
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined
  }, value)
}

function resolveHtmlExtraction(result: HtmlExtractionResult): HtmlExtraction {
  if (isHtmlExtraction(result)) {
    return result
  }

  return {
    projection: result,
    [HTML_EXTRACTION_SENTINEL]: true,
  }
}

function isHtmlExtraction(value: unknown): value is HtmlExtraction {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (value as Record<string, unknown>)[HTML_EXTRACTION_SENTINEL] === true,
  )
}

function normalizeProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeProjection(entry))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        const normalizedValue = normalizeProjection((value as Record<string, unknown>)[key])
        if (normalizedValue !== undefined) {
          accumulator[key] = normalizedValue
        }
        return accumulator
      }, {})
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN'
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? 'Infinity' : '-Infinity'
    }
    if (Object.is(value, -0)) {
      return 0
    }
  }

  return value
}

function stableFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalizeProjection(value))).digest('hex')
}

function defaultFeedEntryProjection(entry: FeedEntrySnapshot): unknown {
  return {
    id: entry.id,
    title: entry.title,
    link: entry.link,
    summary: entry.summary,
    author: entry.author,
    categories: entry.categories,
    publishedAt: entry.publishedAt,
    updatedAt: entry.updatedAt,
  }
}

function feedEntryContentFingerprint(entry: FeedEntrySnapshot): string {
  return stableFingerprint({
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    author: entry.author,
    categories: entry.categories,
    link: entry.link,
    publishedAt: entry.publishedAt,
    updatedAt: entry.updatedAt,
  })
}

function resolveFeedEntryVersion(
  entry: FeedEntrySnapshot,
  customVersion?: (entry: FeedEntrySnapshot) => string | number | boolean | null | undefined,
): string {
  const explicit = customVersion?.(entry)
  if (explicit !== undefined && explicit !== null) {
    return String(explicit)
  }

  return entry.updatedAt
    ?? entry.publishedAt
    ?? feedEntryContentFingerprint(entry)
}

function resolveFeedEntryRevision(version: string, contentFingerprint: string): string {
  return stableFingerprint({ version, contentFingerprint })
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#(x?[0-9a-f]+);/giu, (_match, entity: string) => {
      const codePoint = entity[0]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(1), 16)
        : Number.parseInt(entity, 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, '$1')
}

function cleanText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = decodeXmlEntities(stripCdata(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  return normalized.length > 0 ? normalized : undefined
}

function cleanContent(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = decodeXmlEntities(stripCdata(value).trim())
  return normalized.length > 0 ? normalized : undefined
}

type FeedNode = {
  name: string
  attributes: Record<string, string>
  innerXml?: string
}

function parseFeedEntries(xml: string): FeedEntrySnapshot[] {
  const channel = findFirstNodeAnywhere(xml, ['channel'])
  const feed = findFirstNodeAnywhere(xml, ['feed'])
  const items = findDirectChildNodes(channel?.innerXml ?? xml, 'item').map((node) => ({ kind: 'rss' as const, node }))
  const entries = findDirectChildNodes(feed?.innerXml ?? xml, 'entry').map((node) => ({ kind: 'atom' as const, node }))
  const blocks = items.length > 0 ? items : entries

  return blocks.map(({ kind, node }, index) => {
    const id = firstNodeText(node, kind === 'rss' ? ['guid', 'id', 'link', 'title'] : ['id', 'link', 'title']) ?? `entry-${index}`
    return {
      id,
      title: firstNodeText(node, ['title']),
      link: findFeedLink(node),
      summary: firstNodeText(node, ['description', 'summary']),
      content: firstNodeContent(node, ['content:encoded', 'content']),
      author: findAuthor(node),
      categories: (() => {
        const values = findFeedCategories(node)
        return values.length > 0 ? values : undefined
      })(),
      publishedAt: toIsoDate(firstNodeText(node, ['pubDate', 'published', 'issued'])),
      updatedAt: toIsoDate(firstNodeText(node, ['updated', 'modified'])),
    }
  })
}

function findFeedLink(node: FeedNode): string | undefined {
  const links = findDirectChildNodes(node.innerXml ?? '', 'link')
  const alternate = links.find((link) => {
    const rel = link.attributes.rel?.toLowerCase()
    return rel === undefined || rel === 'alternate'
  })

  if (alternate?.attributes.href) {
    return decodeXmlEntities(alternate.attributes.href)
  }

  const anyHref = links.find((link) => link.attributes.href)
  if (anyHref?.attributes.href) {
    return decodeXmlEntities(anyHref.attributes.href)
  }

  return firstNodeText(node, ['link'])
}

function findAuthor(node: FeedNode): string | undefined {
  const author = findFirstDirectChildNode(node.innerXml ?? '', ['author', 'dc:creator'])
  if (!author) {
    return undefined
  }

  return firstNodeText(author, ['name'])
    ?? cleanText(author.innerXml)
}

function firstNodeText(node: FeedNode, names: string[]): string | undefined {
  const child = findFirstDirectChildNode(node.innerXml ?? '', names)
  return child ? cleanText(child.innerXml) : undefined
}

function firstNodeContent(node: FeedNode, names: string[]): string | undefined {
  const child = findFirstDirectChildNode(node.innerXml ?? '', names)
  return child ? cleanContent(child.innerXml) : undefined
}

function allNodeTexts(node: FeedNode, names: string[]): string[] {
  return names.flatMap((name) => findDirectChildNodes(node.innerXml ?? '', name))
    .map((child) => cleanText(child.innerXml))
    .filter((value): value is string => value !== undefined)
}

function findFeedCategories(node: FeedNode): string[] {
  return findDirectChildNodes(node.innerXml ?? '', 'category')
    .flatMap((child) => {
      const text = cleanText(child.innerXml)
      if (text !== undefined) {
        return [text]
      }

      const term = child.attributes.term
      if (term !== undefined) {
        const normalized = cleanText(term)
        return normalized !== undefined ? [normalized] : []
      }

      return []
    })
}

function findFirstDirectChildNode(xml: string, names: string[]): FeedNode | undefined {
  for (const name of names) {
    const node = findDirectChildNodes(xml, name)[0]
    if (node) {
      return node
    }
  }
  return undefined
}

function findFirstNodeAnywhere(xml: string, names: string[]): FeedNode | undefined {
  for (const name of names) {
    const node = findNodesAnywhere(xml, name)[0]
    if (node) {
      return node
    }
  }
  return undefined
}

function findNodesAnywhere(xml: string, name: string): FeedNode[] {
  const nodes: FeedNode[] = []
  const lowerName = name.toLowerCase()
  let index = 0

  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start === -1) {
      break
    }

    if (xml.startsWith('<!--', start)) {
      const commentEnd = xml.indexOf('-->', start + 4)
      index = commentEnd === -1 ? xml.length : commentEnd + 3
      continue
    }

    if (xml.startsWith('<![CDATA[', start)) {
      const cdataEnd = xml.indexOf(']]>', start + 9)
      index = cdataEnd === -1 ? xml.length : cdataEnd + 3
      continue
    }

    const end = findTagEnd(xml, start)
    if (end === -1) {
      break
    }

    const rawTag = xml.slice(start + 1, end).trim()
    if (rawTag.startsWith('?') || rawTag.startsWith('!')) {
      index = end + 1
      continue
    }

    const closing = rawTag.startsWith('/')
    const selfClosing = !closing && rawTag.endsWith('/')
    const tagBody = closing ? rawTag.slice(1).trim() : selfClosing ? rawTag.slice(0, -1).trim() : rawTag
    const parsed = parseTag(tagBody)
    if (!parsed || parsed.name.toLowerCase() !== lowerName) {
      index = end + 1
      continue
    }

    if (closing) {
      index = end + 1
      continue
    }

    if (selfClosing) {
      nodes.push({ name: parsed.name, attributes: parsed.attributes, innerXml: '' })
      index = end + 1
      continue
    }

    const close = findClosingTag(xml, parsed.name, end + 1)
    if (!close) {
      throw new Error(`Feed parser encountered an unclosed <${parsed.name}> block`)
    }

    nodes.push({
      name: parsed.name,
      attributes: parsed.attributes,
      innerXml: xml.slice(end + 1, close.start),
    })
    index = close.end + 1
  }

  return nodes
}

function findDirectChildNodes(xml: string, name: string): FeedNode[] {
  const nodes: FeedNode[] = []
  const lowerName = name.toLowerCase()
  let index = 0
  let depth = 0

  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start === -1) {
      break
    }

    if (xml.startsWith('<!--', start)) {
      const commentEnd = xml.indexOf('-->', start + 4)
      index = commentEnd === -1 ? xml.length : commentEnd + 3
      continue
    }

    if (xml.startsWith('<![CDATA[', start)) {
      const cdataEnd = xml.indexOf(']]>', start + 9)
      index = cdataEnd === -1 ? xml.length : cdataEnd + 3
      continue
    }

    const end = findTagEnd(xml, start)
    if (end === -1) {
      break
    }

    const rawTag = xml.slice(start + 1, end).trim()
    if (rawTag.startsWith('?') || rawTag.startsWith('!')) {
      index = end + 1
      continue
    }

    const closing = rawTag.startsWith('/')
    const selfClosing = !closing && rawTag.endsWith('/')
    const tagBody = closing ? rawTag.slice(1).trim() : selfClosing ? rawTag.slice(0, -1).trim() : rawTag
    const parsed = parseTag(tagBody)
    if (!parsed) {
      index = end + 1
      continue
    }

    if (closing) {
      depth = Math.max(0, depth - 1)
      index = end + 1
      continue
    }

    const currentDepth = depth
    depth += selfClosing ? 0 : 1

    if (currentDepth !== 0 || parsed.name.toLowerCase() !== lowerName) {
      index = end + 1
      continue
    }

    if (selfClosing) {
      nodes.push({ name: parsed.name, attributes: parsed.attributes, innerXml: '' })
      index = end + 1
      continue
    }

    const close = findClosingTag(xml, parsed.name, end + 1)
    if (!close) {
      throw new Error(`Feed parser encountered an unclosed <${parsed.name}> block`)
    }

    nodes.push({
      name: parsed.name,
      attributes: parsed.attributes,
      innerXml: xml.slice(end + 1, close.start),
    })
    index = close.end + 1
    depth = 0
  }

  return nodes
}

function findClosingTag(xml: string, name: string, from: number): { start: number; end: number } | undefined {
  const lowerName = name.toLowerCase()
  let depth = 1
  let index = from

  while (index < xml.length) {
    const start = xml.indexOf('<', index)
    if (start === -1) {
      return undefined
    }

    if (xml.startsWith('<!--', start)) {
      const commentEnd = xml.indexOf('-->', start + 4)
      index = commentEnd === -1 ? xml.length : commentEnd + 3
      continue
    }

    if (xml.startsWith('<![CDATA[', start)) {
      const cdataEnd = xml.indexOf(']]>', start + 9)
      index = cdataEnd === -1 ? xml.length : cdataEnd + 3
      continue
    }

    const end = findTagEnd(xml, start)
    if (end === -1) {
      return undefined
    }

    const rawTag = xml.slice(start + 1, end).trim()
    if (rawTag.startsWith('?') || rawTag.startsWith('!')) {
      index = end + 1
      continue
    }

    const closing = rawTag.startsWith('/')
    const selfClosing = !closing && rawTag.endsWith('/')
    const tagBody = closing ? rawTag.slice(1).trim() : selfClosing ? rawTag.slice(0, -1).trim() : rawTag
    const parsed = parseTag(tagBody)
    if (!parsed || parsed.name.toLowerCase() !== lowerName) {
      index = end + 1
      continue
    }

    if (closing) {
      depth -= 1
      if (depth === 0) {
        return { start, end }
      }
    } else if (!selfClosing) {
      depth += 1
    }

    index = end + 1
  }

  return undefined
}

function findTagEnd(xml: string, start: number): number {
  let quote: string | undefined
  for (let index = start + 1; index < xml.length; index += 1) {
    const char = xml[index]
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') {
      return index
    }
  }
  return -1
}

function parseTag(raw: string): { name: string; attributes: Record<string, string> } | undefined {
  const nameMatch = raw.match(/^([^\s/>]+)/u)
  const name = nameMatch?.[1]
  if (!name) {
    return undefined
  }

  const attributes: Record<string, string> = {}
  const attrPattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
  for (const match of raw.slice(name.length).matchAll(attrPattern)) {
    const attrName = match[1]
    if (!attrName) {
      continue
    }
    const attrValue = match[2] ?? match[3] ?? ''
    attributes[attrName] = attrValue
  }

  return { name, attributes }
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString()
}

function decodeFileContent(raw: Buffer): EncodedFileContent {
  if (looksLikeUtf8Text(raw)) {
    return {
      value: raw.toString('utf8'),
      encoding: 'utf8',
    }
  }

  return {
    value: raw.toString('base64'),
    encoding: 'base64',
  }
}

function looksLikeUtf8Text(raw: Buffer): boolean {
  if (raw.length === 0) {
    return true
  }

  const decoded = raw.toString('utf8')
  return !decoded.includes('\uFFFD') && !raw.includes(0)
}

function serializeFeedEntryStateMap(map: Map<string, FeedEntryState>): string {
  return JSON.stringify([...map.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function decodeFeedEntryStateMap(value: string | undefined): Map<string, FeedEntryState> {
  if (!value) {
    return new Map()
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return new Map()
    }

    return new Map(parsed.flatMap((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
        return []
      }

      const key = entry[0]
      const state = entry[1]
      if (typeof state === 'string') {
        return [[key, { version: state, fingerprint: state } satisfies FeedEntryState]]
      }

      if (
        state
        && typeof state === 'object'
        && typeof (state as { version?: unknown }).version === 'string'
        && typeof (state as { fingerprint?: unknown }).fingerprint === 'string'
      ) {
        return [[key, { version: (state as { version: string }).version, fingerprint: (state as { fingerprint: string }).fingerprint } satisfies FeedEntryState]]
      }

      return []
    }))
  } catch {
    return new Map()
  }
}

async function observeFileTarget(target: FileSystemFileObservationTarget): Promise<unknown> {
  const raw = await fs.readFile(target.path)
  const parsed = target.read === 'json'
    ? JSON.parse(raw.toString('utf8'))
    : target.read === 'bytes'
      ? new Uint8Array(raw)
      : decodeFileContent(raw).value

  return target.project ? target.project(parsed) : parsed
}

async function observeDirectoryTarget(target: FileSystemDirectoryObservationTarget): Promise<unknown> {
  const entries = await collectDirectoryEntries(target.path, {
    recursive: target.recursive ?? false,
    includeContent: target.includeContent ?? false,
  })

  const projected = await Promise.all(entries.map(async (entry) => {
    const snapshot: FileSystemDirectoryEntrySnapshot = {
      path: entry.path,
      type: entry.type,
      ...(entry.size !== undefined ? { size: entry.size } : {}),
      ...(entry.content !== undefined ? { content: entry.content } : {}),
      ...(entry.contentEncoding !== undefined ? { contentEncoding: entry.contentEncoding } : {}),
    }
    return target.projectEntry ? target.projectEntry(snapshot) : snapshot
  }))

  return projected
}

async function collectDirectoryEntries(
  rootPath: string,
  options: { recursive: boolean; includeContent: boolean },
  currentPath = rootPath,
): Promise<Array<{ path: string; type: 'file' | 'directory'; size?: number; content?: string; contentEncoding?: 'utf8' | 'base64' }>> {
  const dirents = await fs.readdir(currentPath, { withFileTypes: true })
  const collected: Array<{ path: string; type: 'file' | 'directory'; size?: number; content?: string; contentEncoding?: 'utf8' | 'base64' }> = []

  for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentPath, dirent.name)
    const relativePath = path.relative(rootPath, absolutePath) || dirent.name

    if (dirent.isDirectory()) {
      collected.push({
        path: relativePath,
        type: 'directory',
      })
      if (options.recursive) {
        collected.push(...await collectDirectoryEntries(rootPath, options, absolutePath))
      }
      continue
    }

    if (dirent.isFile()) {
      const stat = await fs.stat(absolutePath)
      const content = options.includeContent ? decodeFileContent(await fs.readFile(absolutePath)) : undefined
      collected.push({
        path: relativePath,
        type: 'file',
        size: stat.size,
        ...(content ? { content: content.value, contentEncoding: content.encoding } : {}),
      })
    }
  }

  return collected
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
    if (state.plan) {
      merged.plan = state.plan
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

export function createObservationPlan(input: {
  targetCapabilities?: ObservationCapabilities
  adapterCapabilities?: ObservationCapabilities
  previousStrategy?: ObservationStrategy | undefined
  resumedFromCheckpoint?: boolean | undefined
}): ObservationPlan {
  const targetCapabilities = input.targetCapabilities ?? {}
  const adapterCapabilities = input.adapterCapabilities ?? {}
  const capabilities = mergeObservationCapabilities(targetCapabilities, adapterCapabilities)
  const strategy = selectObservationStrategy(capabilities)
  const previousStrategy = input.previousStrategy

  let change: ObservationPlan['change']
  if (!previousStrategy) {
    change = {
      kind: 'initial',
      reason: input.resumedFromCheckpoint
        ? 'resumed without a prior recorded plan, selecting the current best strategy'
        : 'first observation plan selected before any resumable state is learned',
    }
  } else if (previousStrategy.mode === strategy.mode) {
    change = {
      kind: 'unchanged',
      reason: 'strategy remains the same after re-evaluating current capabilities and state',
    }
  } else if (compareObservationStrategyPriority(strategy.mode, previousStrategy.mode) < 0) {
    change = {
      kind: 'upgraded',
      reason: `strategy upgraded from ${previousStrategy.mode} to ${strategy.mode} after better resumable capabilities became available`,
    }
  } else {
    change = {
      kind: 'degraded',
      reason: `strategy degraded from ${previousStrategy.mode} to ${strategy.mode} because stronger capabilities are no longer available`,
    }
  }

  return {
    strategy,
    capabilities,
    ...(previousStrategy !== undefined ? { previousStrategy } : {}),
    change,
    inputs: {
      target: targetCapabilities,
      adapter: adapterCapabilities,
      resumedFromCheckpoint: input.resumedFromCheckpoint ?? false,
    },
  }
}

function resolveObservationPlan(
  targetCapabilities: ObservationCapabilities | undefined,
  adapterCapabilities: ObservationCapabilities | undefined,
  checkpoint: CheckpointRecord | undefined,
): ObservationPlan {
  return createObservationPlan({
    ...(targetCapabilities !== undefined ? { targetCapabilities } : {}),
    ...(adapterCapabilities !== undefined ? { adapterCapabilities } : {}),
    ...(checkpoint?.observation?.plan?.strategy !== undefined || checkpoint?.observation?.strategy !== undefined
      ? { previousStrategy: checkpoint?.observation?.plan?.strategy ?? checkpoint?.observation?.strategy }
      : {}),
    resumedFromCheckpoint: checkpoint !== undefined,
  })
}

function compareObservationStrategyPriority(left: ObservationStrategyMode, right: ObservationStrategyMode): number {
  return observationStrategyPriority(left) - observationStrategyPriority(right)
}

function observationStrategyPriority(mode: ObservationStrategyMode): number {
  switch (mode) {
    case 'push':
      return 0
    case 'conditional':
      return 1
    case 'cursor':
      return 2
    case 'probe-then-fetch':
      return 3
    case 'projection-diff':
      return 4
    case 'snapshot-diff':
      return 5
  }
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
