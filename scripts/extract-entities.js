#!/usr/bin/env node
// Entity extraction stage.
//
// Scans each new article's body for known rich-noun mentions (commodities,
// currencies, chokepoints, crypto, indices) and writes their positions into
// the article's frontmatter. Mobile renders these as tappable runs that
// open an EntitySheet with the matching indicator chart + back-references.
//
// v1: deterministic static-rule matching only. Zero LLM calls. Fast, cheap,
// predictable. Ambiguous mentions (rupee, peso, pound) are skipped; a Haiku
// disambiguation pass lands in a later revision.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { parseFrontmatter } from './lib/frontmatter.js'
import { ENTITY_RULES_SORTED, mentionToRegex } from './lib/entity-registry.js'

const ROOT = new URL('..', import.meta.url).pathname
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'

if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list found — skipping entity extraction.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
if (newFiles.length === 0) {
  console.log('No new articles — skipping entity extraction.')
  process.exit(0)
}

/**
 * Scan one article's body for entity mentions. Returns:
 *   - resolved: entities with concrete indicatorIds ready for frontmatter
 *   - pending:  ambiguous matches awaiting a Haiku disambiguation pass
 *
 * `pending` entries carry `candidates` so the Haiku call has the full choice
 * space per mention. The caller resolves them in one batched call across the
 * whole cycle, then merges back into `resolved`.
 */
function extractEntities(body) {
  if (!body || typeof body !== 'string') return { resolved: [], pending: [] }
  const resolved = new Map() // key: indicatorId
  const pending = []

  for (const rule of ENTITY_RULES_SORTED) {
    const re = mentionToRegex(rule.mention)
    const match = re.exec(body)
    if (!match) continue
    if (rule.ambiguous) {
      // Defer — Haiku resolves with article context in the batch pass.
      pending.push({
        mention: match[0],
        candidates: rule.candidates || [{ id: rule.indicatorId, label: rule.indicatorId }],
        kind: rule.kind,
      })
      continue
    }
    if (!resolved.has(rule.indicatorId)) {
      resolved.set(rule.indicatorId, {
        mention: match[0],
        indicatorId: rule.indicatorId,
        kind: rule.kind,
      })
    }
  }
  return { resolved: [...resolved.values()], pending }
}

/**
 * Disambiguate a batch of ambiguous mentions across multiple articles in one
 * Haiku call. Each item carries its article context so Haiku can pick the
 * right indicator id from the candidate list. Returns a map keyed by the
 * caller-supplied `key` → resolved indicator id (or null on failure).
 *
 * Fail-safe: on any error (transport, parse, malformed response) returns an
 * empty map. Callers are expected to fall back to the first candidate
 * (usually the registry default) when a key is missing from the result.
 */
function disambiguateViaHaiku(items) {
  if (items.length === 0) return new Map()
  const invocationId = randomUUID().slice(0, 8)

  const blocks = items
    .map((it, i) => {
      const candidates = it.candidates
        .map((c) => `    - ${c.id}: ${c.label}`)
        .join('\n')
      return `# Item ${i + 1} (key: ${it.key})
  mention: "${it.mention}"
  candidates:
${candidates}
  article context:
  """
  ${it.context.slice(0, 900).replace(/"""/g, "'''")}
  """`
    })
    .join('\n\n')

  const prompt = `You are disambiguating currency/entity mentions from news article bodies. For each item below, choose exactly one candidate id based on the article's context (country, institution, topic).

Rules:
- Return ONLY a JSON object keyed by the integer item key (NOT the string "key N"), mapping to the chosen candidate id.
- If the article genuinely doesn't indicate which candidate fits, pick the first candidate as the safe default.
- Never return a candidate id that wasn't listed for that item.

Example output (for 2 items):
{"1": "fx-pkr", "2": "fx-lbp"}

${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`

  const env = { ...process.env }
  delete env.CLAUDECODE
  const res = spawnSync(
    'claude',
    [
      '--model', 'claude-haiku-4-5-20251001',
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '-p', prompt,
    ],
    { encoding: 'utf-8', timeout: 20_000, maxBuffer: 256 * 1024, env },
  )

  if (res.status !== 0) {
    console.error(`  ✗ entity-haiku ${invocationId}: exit ${res.status}`)
    return new Map()
  }
  try {
    const envelope = JSON.parse(res.stdout)
    const raw = envelope.result ?? envelope.text ?? res.stdout
    const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('no JSON object in output')
    const obj = JSON.parse(cleaned.slice(start, end + 1))
    const out = new Map()
    for (const it of items) {
      const chosen = obj[String(it.key)] ?? obj[it.key]
      const valid = it.candidates.some((c) => c.id === chosen)
      if (valid) out.set(it.key, chosen)
    }
    return out
  } catch (err) {
    console.error(`  ✗ entity-haiku ${invocationId}: parse — ${err.message}`)
    return new Map()
  }
}

/**
 * Insert/replace the `entities:` block in a YAML frontmatter string.
 * Line-based pass: drop any existing `entities:` + its indented children,
 * then append the fresh block. Robust to whether entities was the last key
 * in the frontmatter (where regex lookaheads misbehave).
 */
function writeEntitiesToFrontmatter(raw, entities) {
  const yamlBlock = entities.length > 0
    ? 'entities:\n' + entities.map(e =>
        `  - mention: "${e.mention.replace(/"/g, '\\"')}"\n    indicatorId: "${e.indicatorId}"\n    kind: "${e.kind}"`
      ).join('\n')
    : 'entities: []'

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return raw
  const fm = fmMatch[1]
  const rest = raw.slice(fmMatch[0].length)

  // Strip any existing entities block: drop "entities:" line + all following
  // lines that start with whitespace (its children) until a non-indented
  // line (next top-level key) or EOF.
  const lines = fm.split('\n')
  const stripped = []
  let skipping = false
  for (const line of lines) {
    if (skipping) {
      if (line.length === 0 || /^\s/.test(line)) continue // still inside block
      skipping = false
    }
    if (/^entities:/.test(line)) {
      skipping = true
      continue
    }
    stripped.push(line)
  }

  const updatedFm = stripped.join('\n').trimEnd() + '\n' + yamlBlock
  return `---\n${updatedFm}\n---\n${rest}`
}

// --- Main loop — pass 1: static extraction + collect ambiguous matches ---
const t0 = Date.now()

// Per-file state we'll revisit in pass 2 to inject Haiku-resolved ambiguous
// entities before writing frontmatter.
/** @type {Array<{fullPath: string, raw: string, resolved: ReturnType<typeof extractEntities>['resolved']}>} */
const files = []
/** @type {Array<{key: number, fileIdx: number, mention: string, kind: string, candidates: Array<{id: string, label: string}>, context: string}>} */
const ambiguousQueue = []
let nextKey = 1

for (const rel of newFiles) {
  const filename = basename(rel)
  if (!filename.endsWith('.md')) continue
  const fullPath = join(ROOT, rel)
  if (!existsSync(fullPath)) continue

  const raw = readFileSync(fullPath, 'utf8')
  const { body } = parseFrontmatter(raw)
  const { resolved, pending } = extractEntities(body)

  const fileIdx = files.length
  files.push({ fullPath, raw, resolved })

  for (const p of pending) {
    ambiguousQueue.push({
      key: nextKey++,
      fileIdx,
      mention: p.mention,
      kind: p.kind,
      candidates: p.candidates,
      context: body,
    })
  }
}

// --- Pass 2: batched Haiku disambiguation across all articles this cycle ---
let disambiguations = new Map()
if (ambiguousQueue.length > 0) {
  console.log(`  · entity-haiku: resolving ${ambiguousQueue.length} ambiguous mention(s)`)
  disambiguations = disambiguateViaHaiku(ambiguousQueue)
}

for (const item of ambiguousQueue) {
  // Use Haiku's pick when available; fall back to first candidate.
  const chosenId = disambiguations.get(item.key) ?? item.candidates[0].id
  const file = files[item.fileIdx]
  // Dedupe: don't overwrite an already-resolved entry for the same id.
  if (file.resolved.some((e) => e.indicatorId === chosenId)) continue
  file.resolved.push({
    mention: item.mention,
    indicatorId: chosenId,
    kind: item.kind,
  })
}

// --- Pass 3: write frontmatter + log summary ---
let processed = 0
let totalEntities = 0
const kindCounts = {}

for (const file of files) {
  const { fullPath, raw, resolved } = file
  const updated = writeEntitiesToFrontmatter(raw, resolved)
  if (updated !== raw) {
    writeFileSync(fullPath, updated)
  }
  processed++
  totalEntities += resolved.length
  for (const e of resolved) {
    kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1
  }
  if (resolved.length > 0) {
    const summary = resolved.map((e) => `${e.mention}→${e.indicatorId}`).join(', ')
    console.log(`  ${basename(fullPath, '.md').slice(0, 60)}: ${resolved.length} (${summary})`)
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const kindSummary = Object.entries(kindCounts).map(([k, n]) => `${k}=${n}`).join(' ')
console.log(
  `Entities: ${totalEntities} extracted across ${processed} articles in ${elapsed}s [${kindSummary || 'none'}]${ambiguousQueue.length > 0 ? ` · ${disambiguations.size}/${ambiguousQueue.length} ambiguous resolved via Haiku` : ''}`,
)
