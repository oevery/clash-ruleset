import process from 'node:process'
import { validateConfig } from '../src/config/validate.ts'
import { ensureMihomo } from './lib/mihomo.ts'
import './lib/env.ts'

validateConfig(await ensureMihomo(), process.env.RULESET_DIR)
