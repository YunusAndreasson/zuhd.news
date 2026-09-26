// When zuhd published each article: the author time of the commit that added
// it, which the app orders and dates its river by (2026-09-26).
//
// Not `addedAt`. That is the file's mtime, and the box's `git pull --rebase`
// rewrites every file a replayed commit touches. So a cycle whose push failed
// read as published at the next cycle's rebase, and the app's feed of
// 2026-09-21 carried a story filed the day before reading as published that
// minute. A rebase keeps author time and resets only committer time.
//
// An article the log does not name keeps its mtime (`publishedAt` in
// build.js). That covers this cycle's new articles, which are built before
// they are committed and whose mtime is minutes old and right; anything older
// than the window; and a shallow CI clone.

import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

/**
 * `git log --diff-filter=A --format=@%at --name-only` → slug → ms. The log runs
 * newest first, so a file added twice keeps its newest add, which is the file
 * on disk.
 */
export function parseAddLog(out) {
  const times = new Map()
  let at = NaN
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) at = Number(line.slice(1)) * 1000
    else if (line.endsWith('.md') && Number.isFinite(at)) {
      const slug = basename(line, '.md')
      if (!times.has(slug)) times.set(slug, at)
    }
  }
  return times
}

/**
 * Add times for the articles committed in the last `days`. `--since` keeps
 * the walk to the build's window: ~0.6 s for 14 days, 3 s for the whole
 * history on the box. An empty map outside a git checkout.
 */
export function publishedTimes(root, days) {
  try {
    const out = execFileSync(
      'git',
      ['log', `--since=${days}.days`, '--diff-filter=A', '--no-renames', '--format=@%at', '--name-only', '--', 'content/articles/'],
      { cwd: root, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return parseAddLog(out)
  } catch {
    return new Map()
  }
}
