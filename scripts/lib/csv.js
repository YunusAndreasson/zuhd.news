// CSV, read one way.
//
// Four fetchers read a CSV: conflict events, thermal detections, the famine
// table and the AI labs' scores. The parser was written for the first of them
// and lived in `conflict.js`, so the other three imported a conflict module to
// read a file about something else, and each then turned rows into records
// for itself. They agreed on the fields, because the parser was one; they
// disagreed on a byte-order mark. One stripped it with an invisible character
// written into a regex, one lost it by accident (`trim` counts U+FEFF as
// whitespace), and two did not: for them a file that began with one had a
// first column named `﻿id`, and the column check failed on a file with
// nothing wrong in it. It is stripped here, once, where every reader gets it.

/**
 * A CSV as rows of fields. RFC 4180 as far as these files go: a quoted field
 * may hold commas, line breaks and doubled quotes (`""` is `"`); a line ends
 * in `\n`, `\r\n` or `\r`; a blank line is not a row; a leading byte-order mark
 * is not part of the first field.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * A CSV as objects keyed by its header. Throws when a column the caller needs
 * is missing, so a changed schema is a rejected fetch and not a quiet file of
 * empty fields. A row shorter than the header has `''` for what it lacks.
 *
 * @param {string} text
 * @param {string[]} required
 * @returns {Record<string, string>[]}
 */
export function csvObjects(text, required) {
  const [header, ...rows] = parseCsv(text)
  if (!header) throw new Error('empty CSV')
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length > 0) throw new Error(`missing columns: ${missing.join(', ')}`)
  return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])))
}
