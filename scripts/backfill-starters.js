// Local maintenance only. Run in a disposable checkout of the reviewed commit;
// submit its content diff for normal Git integration.
// node scripts/backfill-starters.js --as-of YYYY-MM-DD (30 UTC publication days)
// node scripts/backfill-starters.js --all (explicit classification rebuild)
// Optional --reviews FILE imports a local JSON object keyed by article filename.
// Values are the desk's starterReview records, including the reviewed revision hash.
import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { pathOf } from './lib/datasets.js'
import { publishedTimes } from './lib/published-at.js'
import { starterCatalogue, rebuildStarters } from './lib/starter-articles.js'
import { validDay } from './lib/period.js'
import { ROOT } from './lib/paths.js'

function backfill() {
  const [option, day, reviewOption, file, ...rest] = process.argv.slice(2)
  const withReviews = reviewOption === '--reviews' && !!file
  if (rest.length || !(option === '--all' && !day || option === '--as-of' && validDay(day) && (!reviewOption || withReviews))) {
    throw new Error('Use --as-of YYYY-MM-DD [--reviews FILE] or --all')
  }
  const reviews = withReviews ? JSON.parse(readFileSync(file, 'utf8')) : {}
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) throw new Error('Expected reviews keyed by filename')
  const end = Date.parse(day) + 86400000
  const options = option === '--all' ? { all: true } : {
    reviews, since: end - 30 * 86400000, through: end,
    publications: publishedTimes(ROOT, new Date(end - 31 * 86400000).toISOString()),
  }
  for (const row of rebuildStarters(pathOf('articles'), starterCatalogue(), options)) {
    if (row.skipped) {
      console.log(`${row.file}\tskipped: ${row.skipped}`)
      continue
    }
    console.log([row.file, Number.isFinite(row.published) ? new Date(row.published).toISOString().slice(0, 10) : 'undated', row.eligible, row.changed].join('\t'))
  }
}

// The parent keeps the same open file description after flock exits. All
// maintenance reads and writes therefore run under the editorial cycle's lock.
if (import.meta.main) {
  const fd = openSync(pathOf('cycleLock'), 'a')
  try {
    const locked = spawnSync('flock', ['-n', '3'], { stdio: ['ignore', 'inherit', 'inherit', fd] })
    if (locked.error) throw locked.error
    if (locked.status !== 0) throw new Error('Editorial cycle lock unavailable')
    backfill()
  } finally {
    closeSync(fd)
  }
}
