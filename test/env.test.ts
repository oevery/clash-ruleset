import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { loadEnvironment } from '../scripts/lib/env.ts'

it('loads dotenv defaults without overriding supplied variables and tolerates only missing files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mihomo-env-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = pathToFileURL(join(directory, '.env'))
  const environment: NodeJS.ProcessEnv = { MRS: 'false', RULESET_BASE_URL: '' }
  loadEnvironment(path, environment)
  await writeFile(path, 'MRS=true\nRULESET_BASE_URL=https://example.com/\nMIHOMO_VERSION=v1.2.3\n')
  loadEnvironment(path, environment)
  assert.deepEqual(environment, { MRS: 'false', RULESET_BASE_URL: '', MIHOMO_VERSION: 'v1.2.3' })
  assert.throws(() => loadEnvironment(pathToFileURL(directory), environment), /Unable to read project .env/)
})
