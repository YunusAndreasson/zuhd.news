// A published file's `generated` stamp, held still while its content is.
//
// The app asks for each map layer with the `ETag` of the copy it holds, and
// the site answers an unchanged file with a 304 and no body — "an unchanged
// layer costs nothing". Unchanged means the same *bytes*, and every one of
// these files carried a clock: `ipc.json` and `firms.json` the build's own
// time, the passthroughs the time their fetcher last ran. So a famine table
// that moves monthly got a new tag on every build, and `conflict.json` —
// 30.8 KB gzipped, a UCDP window that had ended a month earlier — was sent
// again to every reader each time its fetcher's six-hour cache expired
// (measured 2026-10-02). The tag was doing its job; the stamp was lying to it.
//
// So the stamp a file is *published* with is the one it had when its content
// last changed. The fetchers keep stamping every run — `fetch-conflict.js`
// keys its own cache on that — and only the copy under `dist/api/` is held.
// What the content was last time is a hash in a ledger beside the build's
// other caches (`.cache/`, kept between builds on the pipeline box, ignored by
// git). A lost ledger costs one full download of each layer and nothing else.

import { sha1Hex } from './hash.js'
import { readJson, writeJson } from './json-file.js'

/**
 * @typedef {{ hash: string, stamp: string }} StampEntry what a file's content
 * hashed to when it last changed, and the stamp it was published with then
 */

/**
 * `payload` with the stamp it should be published with, and the ledger entry
 * to keep for it. The stamp is `previous`'s when everything but the stamp is
 * what `previous` hashed, and the payload's own otherwise. The key keeps its
 * place, so an unchanged payload serialises to the bytes it had before.
 *
 * A payload with no string under `key` is returned as it came, with no entry:
 * there is nothing to hold.
 *
 * @template {Record<string, unknown>} T
 * @param {StampEntry | undefined} previous
 * @param {T} payload
 * @param {string} [key]
 * @returns {{ payload: T, entry: StampEntry | undefined }}
 */
export function holdStamp(previous, payload, key = 'generated') {
  const stamp = payload?.[key]
  if (typeof stamp !== 'string') return { payload, entry: undefined }
  const { [key]: _stamp, ...content } = payload
  const hash = sha1Hex(content, 40)
  if (previous?.hash === hash && typeof previous.stamp === 'string') {
    return { payload: { ...payload, [key]: previous.stamp }, entry: previous }
  }
  return { payload, entry: { hash, stamp } }
}

/**
 * The ledger at `path`: `hold(name, payload)` for each file a build
 * publishes, then `save()` once. Entries for files this build did not publish
 * are kept — a layer whose source was missing for one cycle comes back with
 * the stamp it left with if nothing else about it changed.
 *
 * @param {string} path
 */
export function openStampLedger(path) {
  const stored = readJson(path, {})
  /** @type {Record<string, StampEntry>} */
  const entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {}
  return {
    /**
     * @template {Record<string, unknown>} T
     * @param {string} name
     * @param {T} payload
     * @param {string} [key]
     * @returns {T}
     */
    hold(name, payload, key = 'generated') {
      const held = holdStamp(entries[name], payload, key)
      if (held.entry) entries[name] = held.entry
      return held.payload
    },
    save() {
      writeJson(path, entries)
    },
  }
}
