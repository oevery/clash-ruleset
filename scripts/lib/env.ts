import process from 'node:process'
import { config } from 'dotenv'

// 固定读取仓库根目录；外部环境变量优先，缺少个人配置时使用默认值。
export function loadEnvironment(path: URL = new URL('../../.env', import.meta.url), environment = process.env): void {
  const { error } = config({ path, processEnv: environment, override: false, quiet: true })
  if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT')
    throw new Error('Unable to read project .env', { cause: error })
}

loadEnvironment()
