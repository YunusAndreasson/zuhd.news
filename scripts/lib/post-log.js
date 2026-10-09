// A log of what was posted, read and written one way.
//
// Three of them: the tweets, the Instagram posts and the breaking pushes
// (`content/.tweet-log.json`, `.instagram-log.json`, `.push-log.json`). Each
// was read, added to, cut to its last hundred entries and written back by its
// own few lines, and they had parted on the two things that matter. The two
// posters read theirs leniently, the push wrote its own in place.
//
// On its own, and importing nothing but the catalog and the write: the push
// (`cycle/breaking-push.js`) must not load the card renderer to keep its log.

import { readFileSync } from 'node:fs'
import { pathOf } from './datasets.js'
import { writeJson } from './json-file.js'

/** How many entries a log keeps: three weeks of cycles, one post a cycle. */
const POST_LOG_CAP = 100

/**
 * A log of what was posted: read whole, added to, written back, the newest
 * `cap` entries kept. For the two posters it is the only memory of what has
 * gone out, so it is read strictly and written atomically.
 *
 * Strictly: a log that does not parse, or is not a list, throws. Read as
 * empty (`readJson(path, [])`, as both posters did) it says no story has ever
 * been posted, the story in hand goes out a second time, and the write that
 * follows replaces a hundred entries with one. A log that is not there is the
 * first run, and is empty.
 *
 * Atomically (`writeJson`): the push log was written in place, 320 KB of it,
 * and its reader took any file it could not parse for "the first decision
 * ever logged", so a write cut short would have ended as a log of one entry.
 *
 * @param {string} name the dataset's name (`lib/datasets.js`)
 * @param {{ path?: string, cap?: number }} [opts] `path` is for a test
 */
export function postLog(name, { path = pathOf(name), cap = POST_LOG_CAP } = {}) {
  /** @type {Record<string, any>[]} */
  let entries = []
  /** @type {string | null} */
  let text = null
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
  }
  if (text !== null) {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      throw new Error(`${path} does not parse (${/** @type {Error} */ (err).message}); it is not read as empty`)
    }
    if (!Array.isArray(parsed)) throw new Error(`${path} is not a list; it is not read as empty`)
    entries = parsed
  }

  const save = () => {
    if (entries.length > cap) entries.splice(0, entries.length - cap)
    writeJson(path, entries)
  }
  return {
    /** The entries, oldest first. Change one in place and `save()`. */
    entries,
    /** Whether the story has gone out: an entry for the slug marked `sent`. @param {string} slug */
    has: (slug) => entries.some((e) => e.slug === slug && e.sent),
    /** Put an entry on the end and write the log. @template {Record<string, any>} T @param {T} entry @returns {T} */
    add(entry) {
      entries.push(entry)
      save()
      return entry
    },
    save,
  }
}

/** @typedef {ReturnType<typeof postLog>} PostLog */
