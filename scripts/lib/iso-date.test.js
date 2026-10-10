// Run: node --test scripts/lib/iso-date.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { isIsoDate } from './iso-date.js'
import { ROOT } from './paths.js'

test('a day or a timestamp is a date, and nothing else is', () => {
  for (const good of ['2026-10-09', '2026-10-09T09:29:18', '2026-10-09T09:29:18Z', '2026-10-09T09:29:18.123+03:00']) {
    assert.equal(isIsoDate(good), true, good)
  }
  // Each of these has reached a date field: an alert with no `fromdate`, the
  // half of "Reuters, India" that lands in a source's date slot, UCDP's own
  // `date_start` uncut, ten characters that are not a date, a day that is not
  // in the calendar.
  for (const bad of ['', 'India', '2026-03-31 00:00:00.000', '31/03/2026', '2026-02-30', '2026-13-01', null, undefined, 20261009]) {
    assert.equal(isIsoDate(bad), false, String(bad))
  }
})

// The test is the app's, which a fetcher cannot import: it is TypeScript in
// another workspace. So the two copies are held together by their text. If
// the app's changes, this fails, and the one here is changed with it.
test("it is the app's test, to the letter", () => {
  const body = (source, opening) => {
    const from = source.indexOf(opening)
    assert.ok(from >= 0, `no "${opening}"`)
    const lines = source.slice(from).split('\n')
    const end = lines.indexOf('}')
    return lines
      .slice(1, end)
      .map((line) => line.trim().replace(/;$/, ''))
      .filter((line) => line && !line.startsWith('//'))
      .join('\n')
      // The app braces the one branch this side writes on a line.
      .replace(/if \((.*)\) \{\nreturn (.*)\n\}/, 'if ($1) return $2')
  }
  const app = body(readFileSync(join(ROOT, 'mobile/lib/data-freshness.ts'), 'utf8'), 'export function isIsoDate(')
  const here = body(readFileSync(join(ROOT, 'scripts/lib/iso-date.js'), 'utf8'), 'export function isIsoDate(')
  assert.equal(here, app)
})
