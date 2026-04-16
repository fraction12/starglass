import {
  defineEvent,
  eventIsNewerThanCursor,
  makePollResult,
  stableEventId,
  type CheckpointRecord,
  type ObservationEvent,
  type ObservationTarget,
  type SourceAdapter,
} from 'starglass'
import type { BuildSnapshot } from './fixture.js'

export type BuildStateTarget = ObservationTarget & {
  source: 'example.buildkite'
  pipeline: string
  branch?: string
  watchStates: Array<'passed' | 'failed' | 'canceled'>
}

export interface BuildProviderClient {
  listBuilds(input: {
    pipeline: string
    branch?: string
    since?: string
  }): Promise<BuildSnapshot[]>
}

interface NormalizedBuildPayload {
  pipeline: string
  branch: string
  buildNumber: number
  state: BuildSnapshot['state']
  summary: string
  providerUpdatedAt: string
}

export function makeBuildTarget(input: {
  pipeline: string
  branch?: string
  watchStates?: Array<'passed' | 'failed' | 'canceled'>
}): BuildStateTarget {
  const branchSegment = input.branch ?? '*'
  return {
    id: `example.buildkite:${input.pipeline}:${branchSegment}`,
    source: 'example.buildkite',
    subject: `example.buildkite:${input.pipeline}:${branchSegment}`,
    pipeline: input.pipeline,
    ...(input.branch ? { branch: input.branch } : {}),
    watchStates: input.watchStates ?? ['failed'],
    dispatch: {
      kind: 'handler',
      handler: async () => {},
    },
  }
}

export class ExternalBuildkiteAdapter implements SourceAdapter<BuildStateTarget> {
  readonly source = 'example.buildkite'

  constructor(private readonly client: BuildProviderClient) {}

  async poll(target: BuildStateTarget, checkpoint?: CheckpointRecord) {
    const rawBuilds = await this.client.listBuilds({
      pipeline: target.pipeline,
      ...(target.branch ? { branch: target.branch } : {}),
      ...(checkpoint?.providerCursor ? { since: checkpoint.providerCursor } : {}),
    })

    const events = rawBuilds
      .filter((build) => target.watchStates.includes(build.state as BuildStateTarget['watchStates'][number]))
      .filter((build) => eventIsNewerThanCursor({ occurredAt: build.updatedAt } as ObservationEvent, checkpoint?.providerCursor))
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.buildId - right.buildId)
      .map((build) => this.normalizeBuild(target, build))

    const providerCursor = rawBuilds
      .map((build) => build.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? checkpoint?.providerCursor

    return makePollResult({
      events,
      ...(providerCursor ? { providerCursor } : {}),
      polledAt: new Date().toISOString(),
    })
  }

  private normalizeBuild(target: BuildStateTarget, build: BuildSnapshot): ObservationEvent<NormalizedBuildPayload> {
    const kind = `build.${build.state}`
    return defineEvent({
      id: stableEventId(target.subject, kind, build.buildId, build.updatedAt),
      kind,
      source: this.source,
      subject: target.subject,
      occurredAt: build.updatedAt,
      payload: {
        pipeline: build.pipeline,
        branch: build.branch,
        buildNumber: build.number,
        state: build.state,
        summary: `Build #${build.number} ${build.state} on ${build.branch}`,
        providerUpdatedAt: build.updatedAt,
      },
      sourceRef: {
        provider: 'buildkite',
        type: 'build',
        id: String(build.buildId),
        url: build.webUrl,
      },
    })
  }
}
