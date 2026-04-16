export interface BuildSnapshot {
  buildId: number
  number: number
  pipeline: string
  branch: string
  state: 'running' | 'passed' | 'failed' | 'canceled'
  updatedAt: string
  webUrl: string
}

export function makeBuildSnapshot(input: Partial<BuildSnapshot> & Pick<BuildSnapshot, 'buildId' | 'number' | 'pipeline' | 'branch' | 'state' | 'updatedAt' | 'webUrl'>): BuildSnapshot {
  return {
    buildId: input.buildId,
    number: input.number,
    pipeline: input.pipeline,
    branch: input.branch,
    state: input.state,
    updatedAt: input.updatedAt,
    webUrl: input.webUrl,
  }
}
