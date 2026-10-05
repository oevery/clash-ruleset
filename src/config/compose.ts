import { readFileSync } from 'node:fs'
import { Document, isMap, isScalar, parseDocument } from 'yaml'

export default function composeConfig(directory = new URL('../../config/', import.meta.url)): Document {
  const config = new Document({}, { merge: true })
  for (const name of ['providerset.yaml', 'header.yaml', 'proxyset.yaml', 'routing.yaml']) {
    const fragment = parseDocument(readFileSync(new URL(name, directory), 'utf8'), { merge: true })
    if (fragment.errors.length)
      throw fragment.errors[0]
    if (!isMap(fragment.contents))
      throw new Error(`Configuration fragment must be a mapping: ${name}`)
    for (const pair of fragment.contents.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
        throw new Error(`Configuration keys must be strings: ${name}`)
      if (config.has(pair.key.value))
        throw new Error(`Duplicate configuration key: ${pair.key.value}`)
      if (name !== 'providerset.yaml' && pair === fragment.contents.items[0])
        pair.key.spaceBefore = true
      config.add(pair)
    }
  }
  return config
}
