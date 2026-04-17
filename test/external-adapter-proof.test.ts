import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repoRoot = new URL('..', import.meta.url)

test('external adapter example can be authored against the packaged public surface only', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'starglass-pack-proof-'))

  let tarballPath: string | undefined

  try {
    const packageJson = JSON.parse(await readFile(new URL('./package.json', repoRoot), 'utf8')) as { version: string }
    tarballPath = path.join(repoRoot.pathname, `starglass-${packageJson.version}.tgz`)

    const pkgJson = {
      name: 'starglass-external-proof',
      private: true,
      type: 'module',
      dependencies: {
        starglass: `file:${tarballPath}`,
      },
    }

    await writeFile(path.join(sandbox, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8')

    const sourceLines = [
      "import assert from 'node:assert/strict'",
      "import { defineEvent, eventIsNewerThanCursor, makePollResult, stableEventId } from 'starglass'",
      '',
      'function makeBuildTarget(input) {',
      "  const branchSegment = input.branch ?? '*'",
      '  return {',
      '    id: `example.buildkite:${input.pipeline}:${branchSegment}`,',
      "    source: 'example.buildkite',",
      '    subject: `example.buildkite:${input.pipeline}:${branchSegment}`,',
      '    pipeline: input.pipeline,',
      '    ...(input.branch ? { branch: input.branch } : {}),',
      "    watchStates: input.watchStates ?? ['failed'],",
      '    dispatch: {',
      "      kind: 'handler',",
      '      handler: async () => {},',
      '    },',
      '  }',
      '}',
      '',
      'class ExternalBuildkiteAdapter {',
      "  source = 'example.buildkite'",
      '',
      '  constructor(client) {',
      '    this.client = client',
      '  }',
      '',
      '  async poll(target, checkpoint) {',
      '    const rawBuilds = await this.client.listBuilds({',
      '      pipeline: target.pipeline,',
      '      ...(target.branch ? { branch: target.branch } : {}),',
      '      ...(checkpoint?.providerCursor ? { since: checkpoint.providerCursor } : {}),',
      '    })',
      '',
      '    const events = rawBuilds',
      '      .filter((build) => target.watchStates.includes(build.state))',
      '      .filter((build) => eventIsNewerThanCursor({ occurredAt: build.updatedAt }, checkpoint?.providerCursor))',
      '      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.buildId - right.buildId)',
      '      .map((build) =>',
      '        defineEvent({',
      '          id: stableEventId(target.subject, `build.${build.state}`, build.buildId, build.updatedAt),',
      '          kind: `build.${build.state}`,',
      '          source: this.source,',
      '          subject: target.subject,',
      '          occurredAt: build.updatedAt,',
      '          payload: {',
      '            pipeline: build.pipeline,',
      '            branch: build.branch,',
      '            buildNumber: build.number,',
      '            state: build.state,',
      '            summary: `Build #${build.number} ${build.state} on ${build.branch}`,',
      '            providerUpdatedAt: build.updatedAt,',
      '          },',
      '          sourceRef: {',
      "            provider: 'buildkite',",
      "            type: 'build',",
      '            id: String(build.buildId),',
      '            url: build.webUrl,',
      '          },',
      '        }),',
      '      )',
      '',
      '    const providerCursor = rawBuilds',
      '      .map((build) => build.updatedAt)',
      '      .sort((left, right) => right.localeCompare(left))[0] ?? checkpoint?.providerCursor',
      '',
      '    return makePollResult({',
      '      events,',
      '      ...(providerCursor ? { providerCursor } : {}),',
      "      polledAt: '2026-04-16T10:08:00.000Z',",
      '    })',
      '  }',
      '}',
      '',
      'const adapter = new ExternalBuildkiteAdapter({',
      '  async listBuilds() {',
      '    return [',
      '      {',
      '        buildId: 101,',
      '        number: 77,',
      "        pipeline: 'acme/release',",
      "        branch: 'main',",
      "        state: 'running',",
      "        updatedAt: '2026-04-16T10:00:00.000Z',",
      "        webUrl: 'https://ci.example.test/builds/101',",
      '      },',
      '      {',
      '        buildId: 102,',
      '        number: 78,',
      "        pipeline: 'acme/release',",
      "        branch: 'main',",
      "        state: 'failed',",
      "        updatedAt: '2026-04-16T10:05:00.000Z',",
      "        webUrl: 'https://ci.example.test/builds/102',",
      '      },',
      '      {',
      '        buildId: 103,',
      '        number: 79,',
      "        pipeline: 'acme/release',",
      "        branch: 'main',",
      "        state: 'passed',",
      "        updatedAt: '2026-04-16T10:07:00.000Z',",
      "        webUrl: 'https://ci.example.test/builds/103',",
      '      },',
      '    ]',
      '  },',
      '})',
      '',
      'const target = makeBuildTarget({',
      "  pipeline: 'acme/release',",
      "  branch: 'main',",
      "  watchStates: ['failed'],",
      '})',
      '',
      'const first = await adapter.poll(target)',
      'assert.equal(first.events.length, 1)',
      "assert.equal(first.events[0]?.kind, 'build.failed')",
      'assert.equal(first.events[0]?.subject, target.subject)',
      'assert.equal(first.events[0]?.payload.buildNumber, 78)',
      "assert.equal(first.events[0]?.sourceRef?.id, '102')",
      "assert.equal(eventIsNewerThanCursor(first.events[0], '2026-04-16T10:04:00.000Z'), true)",
      '',
      'const second = await adapter.poll(target, {',
      '  observationTargetId: target.id,',
      '  source: target.source,',
      '  subject: target.subject,',
      "  providerCursor: '2026-04-16T10:05:00.000Z',",
      '  dispatchedEventIds: [first.events[0].id],',
      '})',
      'assert.equal(second.events.length, 1)',
      'assert.equal(second.events[0]?.id, first.events[0]?.id)',
      "assert.equal(second.providerCursor, '2026-04-16T10:07:00.000Z')",
      '',
    ]

    await writeFile(path.join(sandbox, 'proof.mjs'), `${sourceLines.join('\n')}\n`, 'utf8')

    const { execFile } = await import('node:child_process')
    await new Promise<void>((resolve, reject) => {
      execFile('npm', ['pack', '--silent'], { cwd: repoRoot.pathname }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`npm pack failed\n${stdout}\n${stderr}`))
          return
        }
        resolve()
      })
    })
    await new Promise<void>((resolve, reject) => {
      execFile('npm', ['install'], { cwd: sandbox }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`npm install failed\n${stdout}\n${stderr}`))
          return
        }
        resolve()
      })
    })

    await new Promise<void>((resolve, reject) => {
      execFile(process.execPath, ['proof.mjs'], { cwd: sandbox }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`proof script failed\n${stdout}\n${stderr}`))
          return
        }
        resolve()
      })
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
    if (tarballPath) {
      await rm(tarballPath, { force: true })
    }
  }
})
