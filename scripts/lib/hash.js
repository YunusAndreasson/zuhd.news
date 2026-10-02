// Cache keys for the narration stages: a short sha1 of a string, or of a
// value's JSON.
//
// Ten copies of `createHash('sha1').update(…).digest('hex').slice(0, n)`
// across the narrators. The algorithm and the serialisation are part of every
// key already on disk, so this is sha1 over `JSON.stringify` exactly as they
// were — changing either would re-narrate every cached item once, at Opus
// prices.

import { createHash } from 'node:crypto'

/**
 * @param {unknown} value a string is hashed as is, anything else as its JSON
 * @param {number} [length] hex characters kept
 */
export const sha1Hex = (value, length = 16) =>
  createHash('sha1')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, length)
