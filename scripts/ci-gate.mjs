import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

export const checkGate = (needs) => {
  assert.equal(needs.changes.result, 'success', 'Change detection must succeed')
  const source = needs.changes.outputs.source
  assert.ok(source === 'true' || source === 'false', 'Missing source validation decision')
  const expected = source === 'true' ? 'success' : 'skipped'
  for (const job of ['verify', 'compatibility']) {
    assert.equal(needs[job].result, expected, `${job} must be ${expected}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needs = JSON.parse(process.env.CI_NEEDS)
  console.log(JSON.stringify(needs, null, 2))
  checkGate(needs)
  console.log('CI Gate passed')
}
