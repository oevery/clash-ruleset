import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import composeConfig from './compose.ts'

export async function buildConfig(): Promise<void> {
  const target = new URL('../../config/config.yaml', import.meta.url)
  const content = composeConfig().toString({ lineWidth: 0, flowCollectionPadding: true })
  const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../', import.meta.url)), fix: true })
  const [result] = await eslint.lintText(content, { filePath: fileURLToPath(target) })
  if (!result || result.errorCount)
    throw new Error('Generated configuration does not pass ESLint')
  writeFileSync(target, result.output ?? content)
}
