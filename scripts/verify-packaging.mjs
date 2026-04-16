import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const tarballName = 'starglass-0.1.0.tgz'
const tarballPath = path.join(repoRoot, tarballName)
const allowedFiles = [
  'README.md',
  'dist/core.d.ts',
  'dist/core.d.ts.map',
  'dist/core.js',
  'dist/core.js.map',
  'dist/index.d.ts',
  'dist/index.d.ts.map',
  'dist/index.js',
  'dist/index.js.map',
  'package.json',
]

async function listTarballFiles() {
  const { stdout } = await execFileAsync('tar', ['-tzf', tarballPath], { cwd: repoRoot })
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^package\//, ''))
    .sort()
}

async function run() {
  const files = await listTarballFiles()
  assert.deepEqual(files, [...allowedFiles].sort(), `tarball contents changed\nexpected: ${allowedFiles.join(', ')}\nreceived: ${files.join(', ')}`)

  const sandbox = await mkdtemp(path.join(tmpdir(), 'starglass-pack-verify-'))

  try {
    const pkgJson = {
      name: 'starglass-pack-verify',
      private: true,
      type: 'module',
      dependencies: {
        starglass: `file:${tarballPath}`,
      },
    }

    await writeFile(path.join(sandbox, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8')

    const smoke = [
      "import assert from 'node:assert/strict'",
      "import { ObservationRuntime, stableEventId } from 'starglass'",
      '',
      "assert.equal(typeof ObservationRuntime, 'function')",
      "assert.equal(typeof stableEventId, 'function')",
    ].join('\n')

    await writeFile(path.join(sandbox, 'smoke.mjs'), `${smoke}\n`, 'utf8')

    await execFileAsync('npm', ['install'], { cwd: sandbox })
    await execFileAsync(process.execPath, ['smoke.mjs'], { cwd: sandbox })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
