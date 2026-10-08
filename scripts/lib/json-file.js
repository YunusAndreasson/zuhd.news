// JSON snapshots on disk: the one read and the one write.
//
// Every stage reads the previous snapshot and writes the next one, and there
// were ~70 hand-rolled copies of each half. They disagreed on the two things
// that matter:
//
// - **A corrupt file.** `existsSync(p) ? JSON.parse(…) : {}` throws on a
//   truncated snapshot and takes the stage down with it; `try { … } catch {}`
//   survives it and says nothing. `readJson` survives it *and says so* — a
//   snapshot that silently reads as empty looks exactly like a quiet day.
// - **A killed write.** Stages run under `timeout`, and a SIGTERM during a
//   multi-megabyte `writeFileSync` leaves a truncated file where the last good
//   snapshot was, which is the one outcome "degrade to the previous snapshot,
//   never to nothing" exists to rule out. `writeJson` writes a sibling and
//   renames it over, which is atomic on a POSIX filesystem.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Parse the JSON file at `path`, or return `fallback` when it is missing or
 * unreadable. A parse failure is logged (to stderr, so it never lands in a
 * stdout a caller is parsing); a missing file is not — that is a normal state
 * for every snapshot on its first run.
 *
 * @param {string} path
 * @param {unknown} [fallback]
 * @returns {any}
 */
export function readJson(path, fallback = null) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    const { message } = /** @type {Error} */ (err)
    console.error(`readJson: ${path} is not valid JSON (${message}) — using the fallback`)
    return fallback
  }
}

/**
 * Write `data` to `path` as JSON with a trailing newline, atomically: a
 * reader — or the next cycle, after a killed one — sees the old file or the
 * new one, never half of either. Parent directories are created.
 *
 * `pretty` (two-space indent) for anything a person diffs in `content/`;
 * compact for the large machine-read snapshots, where indentation is most of
 * the bytes.
 *
 * @param {string} path
 * @param {unknown} data
 * @param {{ pretty?: boolean }} [opts]
 */
export function writeJson(path, data, { pretty = true } = {}) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)}\n`)
  renameSync(tmp, path)
}
