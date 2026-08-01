#!/usr/bin/env node
// The star catalogue behind the map's sky, reduced from two published sources.
//
//   Positions, magnitudes and colours — Yale Bright Star Catalogue, 5th Revised
//   Ed. (Hoffleit & Warren 1991), via CDS VizieR `V/50/catalog`. Public domain.
//   Proper names — the IAU Working Group on Star Names (WGSN) Catalog of Star
//   Names, which is CC BY and is the only list of names that is *anyone's* to
//   give: everything else in circulation is one compiler's preference dressed
//   as a fact, and this map has to be able to say who is saying it.
//
// Output: shared/data/stars.json, committed. Run: node scripts/generate-stars.js
//
// **This script is committed because its output is.** `shared/countries/
// country-augmented.ts` names a generator that is not in the repo, so it cannot
// be regenerated and 32 countries have been hatched on every metric ever since.
// A committed payload with no committed generator is a payload that can only
// ever be deleted.
//
// HYG was the other candidate and is refused: it is CC BY-SA, and share-alike
// on a data file that the site serves is a licence term reaching into the site.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argAt } from './lib/argv.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'shared', 'data', 'stars.json')

// Magnitude 5.5 is a little past the naked-eye limit under a dark sky (~6.0)
// and well past it under any sky a reader of this site is standing under. The
// payload is sorted by magnitude, so this is a *ceiling* and not a commitment:
// the island slices a prefix, and lowering what it draws costs no refetch.
const MAG_LIMIT = Number(argAt('mag', '5.5'))

const BSC = 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=V/50/catalog' +
  '&-out=HR,Name,RAJ2000,DEJ2000,Vmag,B-V,Parallax&-out.max=unlimited' +
  `&Vmag=%3C${MAG_LIMIT + 0.005}&-sort=Vmag`
const IAU = 'https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt'

const fetchText = async (url, what) => {
  const res = await fetch(url, { headers: { 'user-agent': 'zuhd.news star catalogue build' } })
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`)
  return res.text()
}

/** "06 45 08.9" → degrees. */
const raToDeg = (s) => {
  const [h, m, sec] = s.trim().split(/\s+/).map(Number)
  return (h + m / 60 + sec / 3600) * 15
}

/** "-16 42 58" → degrees. The sign belongs to the whole value, not the degrees
 *  field — `-00 30 00` is half a degree *south*, and reading the sign off a
 *  numeric parse of "-00" gives zero. */
const decToDeg = (s) => {
  const t = s.trim()
  const sign = t.startsWith('-') ? -1 : 1
  const [d, m, sec] = t.replace(/^[+-]/, '').split(/\s+/).map(Number)
  return sign * (d + m / 60 + sec / 3600)
}

/**
 * The Bright Star Catalogue's `Name` column, which packs three designations
 * into ten characters: a Flamsteed number, a Bayer letter with an optional
 * superscript index, and the three-letter constellation. "  9Alp CMa" is
 * 9 Canis Majoris / Alpha Canis Majoris; " 87Alp Tau" is 87 Tauri.
 *
 * Parsed rather than shipped whole, because the card sets the Greek letter as a
 * letter and the constellation by its full name — and because a blank field is
 * common (a third of the catalogue at this magnitude has no Bayer letter), so
 * the card has to know which of the three it is missing.
 */
const BAYER = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
}

const parseName = (raw) => {
  const s = raw.padEnd(10, ' ')
  const flamsteed = s.slice(0, 3).trim()
  const bayerRaw = s.slice(3, 6).trim()
  const index = s.slice(6, 7).trim()
  const con = s.slice(7, 10).trim()
  const greek = BAYER[bayerRaw] ?? (bayerRaw || '')
  return {
    f: flamsteed,
    b: greek && index ? `${greek}${index}` : greek,
    c: con,
  }
}

const main = async () => {
  const [bscText, iauText] = await Promise.all([
    fetchText(BSC, 'VizieR V/50'),
    fetchText(IAU, 'IAU-CSN'),
  ])

  // IAU proper names, keyed by Harvard Revised number. The file's `Designation`
  // column carries "HR 1457" for anything in the Bright Star Catalogue; the
  // rows that do not (exoplanet hosts, most of them fainter than this cut) have
  // no HR and are skipped rather than joined on a coordinate, which is the join
  // that looks right and silently attaches a name to a neighbour.
  const names = new Map()
  for (const line of iauText.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('$')) continue
    // Fixed-width columns: ASCII name 0-17, name with diacritics 18-35,
    // designation 36-48. The diacritics column is the one taken — it is the
    // spelling the IAU approved, and the ASCII column exists for systems that
    // cannot set it, which a browser is not.
    const proper = line.slice(18, 36).trim()
    const designation = line.slice(36, 49).trim()
    const m = /^HR\s+(\d+)$/.exec(designation)
    if (m && proper) names.set(Number(m[1]), proper)
  }

  const stars = []
  for (const line of bscText.split('\n')) {
    if (!line || line.startsWith('#')) continue
    // HR, Name, RAJ2000, DEJ2000, Vmag, B-V, Parallax — the `-out=` order in
    // the request above, which is the order VizieR emits and the only thing
    // that binds these indices. Changing that list means changing these.
    const cols = line.split('\t')
    if (cols.length < 7) continue
    const hr = Number(cols[0])
    if (!Number.isFinite(hr) || hr === 0) continue
    const mag = Number(cols[4])
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue
    const ra = cols[2]?.trim()
    const dec = cols[3]?.trim()
    if (!ra || !dec) continue

    const bv = Number(cols[5])
    const plx = Number(cols[6])
    stars.push({
      hr,
      ...parseName(cols[1] ?? ''),
      ra: raToDeg(ra),
      dec: decToDeg(dec),
      mag,
      // B−V runs about −0.4 (hot blue) to +2.0 (cool red) over this set. A star
      // with no measured colour is not a white star: it takes a sentinel and
      // the island draws it neutral.
      bv: Number.isFinite(bv) ? bv : null,
      // Trigonometric parallax in arcseconds, three decimals. Below 5 mas the
      // quantisation alone is a ±10% distance, and the BSC's parallaxes are
      // pre-Hipparcos; anything fainter than that gets no distance rather than
      // a figure the card would print to three significant figures.
      plx: Number.isFinite(plx) && plx >= 0.005 ? plx : null,
      name: names.get(hr) ?? null,
    })
  }

  stars.sort((a, b) => a.mag - b.mag || a.hr - b.hr)

  // Flat integer arrays, one entry per star, in magnitude order. Four reasons
  // it is not an array of objects: it gzips to about a third of the size, it
  // decodes into `Float32Array`s with no per-star allocation, the magnitude
  // array is monotonic so a brightness cut is a prefix slice rather than a
  // filter, and the island's hot loop is then pure typed-array arithmetic.
  const payload = {
    source: 'Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991), CDS V/50',
    names: 'IAU Working Group on Star Names (WGSN) Catalog of Star Names',
    epoch: 2000,
    magLimit: MAG_LIMIT,
    count: stars.length,
    // millidegrees; dec is offset by +90000 so every value is a positive int
    ra: stars.map((s) => Math.round(s.ra * 1000)),
    dec: stars.map((s) => Math.round(s.dec * 1000) + 90000),
    // centimagnitudes, offset past Sirius's −1.46 so every value is positive
    mag: stars.map((s) => Math.round(s.mag * 100) + 200),
    // centi-B−V, offset; 9999 means "no measured colour"
    bv: stars.map((s) => (s.bv === null ? 9999 : Math.round(s.bv * 100) + 100)),
    // milliarcseconds; 0 means "no usable parallax"
    plx: stars.map((s) => (s.plx === null ? 0 : Math.round(s.plx * 1000))),
    hr: stars.map((s) => s.hr),
    // Designations, as three parallel arrays of short strings. Sparse in
    // practice and empty strings gzip to nothing.
    bayer: stars.map((s) => s.b),
    flamsteed: stars.map((s) => s.f),
    con: stars.map((s) => s.c),
    // index → IAU proper name, for the ~300 stars that have one
    proper: Object.fromEntries(
      stars.flatMap((s, i) => (s.name ? [[i, s.name]] : [])),
    ),
  }

  mkdirSync(dirname(OUT), { recursive: true })
  const tmp = `${OUT}.tmp`
  writeFileSync(tmp, JSON.stringify(payload))
  renameSync(tmp, OUT)

  const kb = Math.round(readFileSync(OUT).length / 1024)
  const named = Object.keys(payload.proper).length
  console.log(
    `stars.json: ${stars.length} stars to mag ${MAG_LIMIT}, ${named} named, ${kb}KB` +
      `${existsSync(OUT) ? '' : ' (write failed)'}`,
  )
}

await main()
