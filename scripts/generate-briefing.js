#!/usr/bin/env node
// zuhd.news daily audio briefing generator
// Three stages: collect articles → Claude SSML → Google TTS MP3

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync, statSync, cpSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import textToSpeech from '@google-cloud/text-to-speech'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const AUDIO_DIR = join(ROOT, 'content', 'audio')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'briefing-prompt.md')
const PROMPT_AR_PATH = join(ROOT, 'scripts', 'briefing-prompt-ar.md')

// Voice config — Chirp 3 HD `Charon` in both languages keeps the timbre
// constant when the bilingual variant alternates EN ↔ AR within a section.
const VOICE_EN = 'en-US-Chirp3-HD-Charon'
const VOICE_AR = 'ar-XA-Chirp3-HD-Charon'

const today = new Date().toISOString().slice(0, 10)

// --- Stage 1: Collect articles from last 24h ---
console.log('=== Stage 1: Collecting articles ===')

const cutoff = Date.now() - 24 * 60 * 60 * 1000
const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md') && f !== 'example.md')

let articles = []
for (const file of files) {
  const raw = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  if (!meta.date) continue
  // Use the later of source date and file mtime (articles may have older source dates)
  const sourceTime = new Date(meta.date).getTime()
  const fileTime = statSync(join(ARTICLES_DIR, file)).mtimeMs
  const addedTime = Math.max(sourceTime, fileTime)
  if (addedTime < cutoff) continue
  const sources = Array.isArray(meta.sources) ? meta.sources : []
  articles.push({
    title: meta.title || basename(file, '.md'),
    category: meta.category || 'uncategorised',
    sources: sources.map(s => s.name).filter(Boolean),
    sourceCountries: sources.map(s => s.country).filter(Boolean),
    eventCoverage: meta.eventCoverage ? Number(meta.eventCoverage) : null,
    concepts: (Array.isArray(meta.concepts) ? meta.concepts : []).slice(0, 3).map(c => typeof c === 'object' ? c.label : c),
    addedTime,
    body: body.slice(0, 300)
  })
}

// Keep the 30 most recent articles — gives Opus enough distinct stories after merges
articles.sort((a, b) => b.addedTime - a.addedTime)
if (articles.length > 30) {
  console.log(`Trimmed from ${articles.length} to 30 articles (most recent)`)
  articles = articles.slice(0, 30)
}
articles.forEach(a => delete a.addedTime) // strip internal field before sending to Claude

if (articles.length === 0) {
  console.log('No articles in last 24h — skipping briefing.')
  process.exit(0)
}

console.log(`Found ${articles.length} articles from last 24h`)

// Inject editorial context from story ledger (backwards-compatible — briefing works without it)
let editorialContext = null
try {
  if (existsSync(LEDGER_PATH)) {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
    if (ledger.stories && ledger.stories.length > 0) {
      const topStories = ledger.stories
        .filter(s => s.importance >= 6 || s.arc === 'breaking' || s.arc === 'developing')
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 15) // cap to keep prompt compact
        .map(({ id, label, importance, arc, coverageCount, summary }) =>
          ({ id, label, importance, arc, coverageCount, summary }))
      if (topStories.length > 0) {
        editorialContext = { topStories }
        console.log(`Loaded ${topStories.length} top stories from story ledger`)
      }
    }
  }
} catch (err) {
  console.warn('Could not read story ledger (continuing without it):', err.message)
}

// Compute hours until next briefing (briefings run at 04:00 and 16:00 UTC only)
const BRIEFING_HOURS = [4, 16]
const now = new Date()
const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
const cycleMinutes = BRIEFING_HOURS.map(h => h * 60)
const nextCycleMin = cycleMinutes.find(m => m > currentMinutes) ?? cycleMinutes[0]
const minutesUntilNext = nextCycleMin > currentMinutes
  ? nextCycleMin - currentMinutes
  : 1440 - currentMinutes + nextCycleMin
const hoursUntilNext = Math.round(minutesUntilNext / 60)

const isFriday = now.getUTCDay() === 5

const payload = { articles, hoursUntilNext, isFriday }
if (editorialContext) payload.editorialContext = editorialContext

// --- Stage 2: Generate SSML via Claude CLI ---
console.log('\n=== Stage 2: Generating SSML bulletin ===')

const promptTemplate = readFileSync(PROMPT_PATH, 'utf-8')
// Inline article data directly into the prompt to avoid tool-call round-trip
const prompt = promptTemplate.replace(
  /The article data and editorial context are provided inline below by the system\. The JSON object contains:/,
  'Here is the article data as JSON:\n\n```json\n' + JSON.stringify(payload, null, 2) + '\n```\n\nThe JSON object contains:'
)
let claudeOutput
try {
  const env = { ...process.env }
  delete env.CLAUDECODE
  const result = spawnSync('claude', [
    '--model', process.env.ZUHD_BRIEFING_MODEL || 'claude-opus-4-7',
    '--effort', 'medium',
    '--no-session-persistence',
    '--max-turns', '1',
    '-p', prompt
  ], { encoding: 'utf-8', timeout: 720_000, maxBuffer: 1024 * 1024, env })
  if (result.status !== 0) {
    throw new Error(result.stderr || `Exit code ${result.status}`)
  }
  claudeOutput = result.stdout
} catch (err) {
  console.error('Claude CLI failed:', err.message)
  process.exit(1)
}

// Strip markdown fences in case Claude wraps output in ```xml or ```ssml
claudeOutput = claudeOutput
  .replace(/^```(?:xml|ssml)?\s*\n?/m, '')
  .replace(/\n?```\s*$/m, '')

// Extract SSML from output — greedy match to capture the last </speak> in case
// Claude wraps output in extra tags that contain inner </speak>-like sequences
let ssml
const ssmlMatch = claudeOutput.match(/<speak[\s\S]*<\/speak>/)
if (ssmlMatch) {
  // Strip any stray content outside the speak tags (e.g. Claude wrapper tags)
  ssml = ssmlMatch[0]
    .replace(/^[\s\S]*?(<speak)/, '$1')
    .replace(/(<\/speak>)[\s\S]*$/, '$1')
    .trim()
  console.log(`SSML extracted (${ssml.length} characters)`)
} else {
  // Fallback: wrap plain text output in speak tags
  console.warn('No SSML tags found — using plain text fallback')
  const plainText = claudeOutput.replace(/<[^>]+>/g, '').trim()
  ssml = `<speak>${plainText}</speak>`
}

// Save SSML transcript for review/debugging
const ssmlPath = join(AUDIO_DIR, `briefing-${today}.ssml`)
writeFileSync(ssmlPath, ssml)
console.log(`SSML saved: ${ssmlPath}`)

// --- Stage 2b: Translate the EN SSML into Arabic SSML via a second Claude pass ---
// Soft-fail: if the AR pass fails (Claude error, malformed output, section-count
// mismatch), we still produce the EN-only briefing. Listeners on AR/BI variants
// will see no briefing for that cycle, which is preferable to blocking EN too.
console.log('\n=== Stage 2b: Translating to Arabic SSML ===')

let arSsml = null
try {
  const arPromptTemplate = readFileSync(PROMPT_AR_PATH, 'utf-8')
  const arPrompt = arPromptTemplate.replace(
    /The English SSML briefing is provided inline below by the system\. It contains:/,
    'Here is the English SSML to translate:\n\n```xml\n' + ssml + '\n```\n\nIt contains:'
  )
  const env = { ...process.env }
  delete env.CLAUDECODE
  const result = spawnSync('claude', [
    '--model', process.env.ZUHD_BRIEFING_MODEL || 'claude-opus-4-7',
    '--effort', 'medium',
    '--no-session-persistence',
    '--max-turns', '1',
    '-p', arPrompt
  ], { encoding: 'utf-8', timeout: 720_000, maxBuffer: 1024 * 1024, env })
  if (result.status !== 0) throw new Error(result.stderr || `Exit code ${result.status}`)
  let arOutput = result.stdout
    .replace(/^```(?:xml|ssml)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
  const arMatch = arOutput.match(/<speak[\s\S]*<\/speak>/)
  if (!arMatch) throw new Error('No <speak> tags in AR output')
  arSsml = arMatch[0]
    .replace(/^[\s\S]*?(<speak)/, '$1')
    .replace(/(<\/speak>)[\s\S]*$/, '$1')
    .trim()
  // Catch the failure mode where Claude returns the English SSML (or a
  // mostly-English translation) — at least half the non-tag, non-whitespace
  // characters should fall in the Arabic Unicode block. Cheaper to fail
  // here than to burn ~7K AR-voice TTS chars synthesizing English text.
  const arabicChars = (arSsml.match(/[؀-ۿ]/g) || []).length
  const denseChars = arSsml.replace(/<[^>]+>/g, '').replace(/\s/g, '').length
  if (denseChars > 0 && arabicChars / denseChars < 0.5) {
    throw new Error(`AR SSML doesn't look Arabic (${arabicChars}/${denseChars} chars in Arabic range)`)
  }
  console.log(`AR SSML extracted (${arSsml.length} characters, ${Math.round(100 * arabicChars / denseChars)}% Arabic)`)
  writeFileSync(join(AUDIO_DIR, `briefing-${today}-ar.ssml`), arSsml)
} catch (err) {
  console.warn(`AR generation failed — producing EN-only: ${err.message}`)
  arSsml = null
}

// --- Stage 3: Synthesize MP3 variants via Google TTS ---
console.log('\n=== Stage 3: Synthesizing audio ===')

mkdirSync(AUDIO_DIR, { recursive: true })

// Pre-recorded audio: transition between sections, outro after last section,
// and a 700ms silence used between EN→AR within a section in the bilingual
// variant. Files must be 24kHz mono MP3 to match TTS output (see public/audio/).
const TRANSITION_MP3 = join(ROOT, 'public', 'audio', 'transition.mp3')
const OUTRO_MP3 = join(ROOT, 'public', 'audio', 'outro.mp3')
const SILENCE_700_MP3 = join(ROOT, 'public', 'audio', 'silence-700ms.mp3')
const hasTransition = existsSync(TRANSITION_MP3)
const hasOutro = existsSync(OUTRO_MP3)
const hasSilence = existsSync(SILENCE_700_MP3)

if (hasTransition) console.log('Using transition music between sections (public/audio/transition.mp3)')
if (!hasSilence && arSsml) console.warn('silence-700ms.mp3 missing — bilingual EN→AR junctions will be abrupt')

// Split a `<speak>...</speak>` document into sections at <p> category
// boundaries. Structure: [intro+lead] [category <p>] [category <p>] ...
// Signoff (everything after the last </p>) is appended to the final category
// so TTS has enough context for natural pacing — tiny standalone chunks
// sound choppy. The trailing 2s break gives the voice room to settle before
// the outro crossfade begins.
function splitSsmlIntoSections(speakDoc) {
  const innerSsml = speakDoc.replace(/^<speak>\s*/, '').replace(/\s*<\/speak>\s*$/, '')
  const pBlocks = [...innerSsml.matchAll(/<p>[\s\S]*?<\/p>/g)]
  const sections = []
  if (pBlocks.length === 0) {
    sections.push({ type: 'intro', ssml: innerSsml })
    return sections
  }
  const introContent = innerSsml.slice(0, pBlocks[0].index)
    .replace(/\s*<break\s[^>]*\/>\s*$/, '').trim()
  if (introContent) sections.push({ type: 'intro', ssml: introContent })
  for (const block of pBlocks) {
    sections.push({ type: 'category', ssml: block[0] })
  }
  const lastBlock = pBlocks[pBlocks.length - 1]
  const signoffContent = innerSsml.slice(lastBlock.index + lastBlock[0].length).trim()
  if (signoffContent && sections.length > 0) {
    sections[sections.length - 1].ssml += '\n' + signoffContent + '\n<break time="2s"/>'
  } else if (signoffContent) {
    sections.push({ type: 'signoff', ssml: signoffContent + '\n<break time="2s"/>' })
  }
  return sections
}

const enSections = splitSsmlIntoSections(ssml)
console.log(`EN: ${enSections.length} sections — ${enSections.map(s => s.type).join(', ')}`)

let arSections = null
if (arSsml) {
  arSections = splitSsmlIntoSections(arSsml)
  console.log(`AR: ${arSections.length} sections — ${arSections.map(s => s.type).join(', ')}`)
  if (arSections.length !== enSections.length) {
    // Section parity is mandatory for the bilingual stitch — without it the
    // Politics(EN)/Politics(AR) pairing slips and listeners hear Economy in
    // English followed by Politics in Arabic. Refuse to produce AR/BI rather
    // than ship a misaligned briefing.
    console.warn(`AR section count (${arSections.length}) != EN (${enSections.length}) — dropping AR/BI variants`)
    arSections = null
  }
}

// Google TTS Chirp3-HD supports up to 5000 bytes per request.
const MAX_BYTES = 4800

// Track open wrapper tags (<p>, <prosody>) so we can close/reopen at chunk boundaries
function getOpenTags(ssmlFragment) {
  const opens = [...ssmlFragment.matchAll(/<(p|prosody)(\s[^>]*)?>/g)].map(m => m[0])
  const closes = [...ssmlFragment.matchAll(/<\/(p|prosody)>/g)]
  const stack = [...opens]
  for (const c of closes) {
    const tag = c[0].match(/<\/(\w+)>/)[1]
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].startsWith(`<${tag}`)) { stack.splice(i, 1); break }
    }
  }
  return stack
}

// Chunk a section into ≤MAX_BYTES pieces, each wrapped in <speak>.
// Primary split is on <break> boundaries; if a single inter-break segment is
// still oversized (e.g. a long category with no inter-story breaks) we
// sub-split on </s> sentence boundaries so a runaway segment can't bypass the
// limit and trigger a TTS rejection.
function chunkSection(sectionSsml) {
  const segs = sectionSsml.split(/(?=<break\s[^>]*\/>)/)
  const result = []
  let current = ''

  const flushCurrent = () => {
    const openTags = getOpenTags(current)
    const closeTags = openTags.reverse().map(t => `</${t.match(/<(\w+)/)[1]}>`)
    result.push(`<speak>${current}${closeTags.join('')}</speak>`)
    current = openTags.reverse().join('')
  }

  for (const seg of segs) {
    // If this segment alone busts the budget, sub-split on sentence boundaries.
    const subSegs = Buffer.byteLength(`<speak>${seg}</speak>`, 'utf-8') > MAX_BYTES
      ? seg.split(/(?<=<\/s>)/).filter(Boolean)
      : [seg]
    for (const sub of subSegs) {
      if (Buffer.byteLength(`<speak>${current}${sub}</speak>`, 'utf-8') > MAX_BYTES && current) {
        flushCurrent()
      }
      current += sub
    }
  }
  if (current) result.push(`<speak>${current}</speak>`)
  return result
}

const client = new textToSpeech.TextToSpeechClient()
const tmpDir = join(AUDIO_DIR, '.tmp')
mkdirSync(tmpDir, { recursive: true })

// Synthesize one section into one or more LINEAR16 WAV files. Returns the
// ordered file paths so the caller can splice them into a variant's playlist.
// LINEAR16 (PCM/WAV) is requested instead of MP3 so the eventual concat
// doesn't compound a lossy decode→re-encode generation — the final
// libmp3lame pass is the only encode in the chain.
async function synthesizeSection(sectionSsml, voiceConfig, sectionDir) {
  mkdirSync(sectionDir, { recursive: true })
  const chunks = chunkSection(sectionSsml)
  const paths = []
  for (let ci = 0; ci < chunks.length; ci++) {
    console.log(`    chunk ${ci + 1}/${chunks.length} (${Buffer.byteLength(chunks[ci], 'utf-8')} bytes, ${voiceConfig.languageCode})`)
    const [response] = await client.synthesizeSpeech({
      input: { ssml: chunks[ci] },
      voice: voiceConfig,
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
        effectsProfileId: ['headphone-class-device']
      }
    })
    const p = join(sectionDir, `chunk-${ci}.wav`)
    writeFileSync(p, Buffer.from(response.audioContent))
    paths.push(p)
  }
  return paths
}

// Synthesize each section in EN, then (if AR is available) in AR. Two passes
// rather than interleaved so a transient TTS error on the AR side doesn't
// corrupt the EN pipeline mid-flight.
const enSectionWavs = []
for (let si = 0; si < enSections.length; si++) {
  console.log(`  Section ${si + 1}/${enSections.length} (${enSections[si].type}) — EN:`)
  enSectionWavs.push(await synthesizeSection(
    enSections[si].ssml,
    { languageCode: 'en-US', name: VOICE_EN },
    join(tmpDir, `s${si}-en`)
  ))
}

let arSectionWavs = null
if (arSections) {
  arSectionWavs = []
  try {
    for (let si = 0; si < arSections.length; si++) {
      console.log(`  Section ${si + 1}/${arSections.length} (${arSections[si].type}) — AR:`)
      arSectionWavs.push(await synthesizeSection(
        arSections[si].ssml,
        { languageCode: 'ar-XA', name: VOICE_AR },
        join(tmpDir, `s${si}-ar`)
      ))
    }
  } catch (err) {
    console.warn(`AR synthesis failed at section ${arSectionWavs.length} — dropping AR/BI variants: ${err.message}`)
    arSectionWavs = null
  }
}

const MUSIC_FILES = new Set([TRANSITION_MP3, OUTRO_MP3, SILENCE_700_MP3])
const CROSSFADE_SEC = 2

// Build the ordered audio-parts list for one variant. Insert transition music
// between sections (skipping before signoff). For the bilingual variant,
// follow each section's EN parts with a 700ms silence beat then the AR parts
// — gives the listener time to register the language switch without the
// timbre change feeling abrupt. The outro is appended at the very end if
// available; the ffmpeg pass crossfades it with the last TTS chunk.
function buildVariantParts(variant) {
  const parts = []
  for (let si = 0; si < enSections.length; si++) {
    if (si > 0 && enSections[si].type !== 'signoff' && hasTransition) {
      parts.push(TRANSITION_MP3)
    }
    if (variant === 'en') {
      parts.push(...enSectionWavs[si])
    } else if (variant === 'ar') {
      parts.push(...arSectionWavs[si])
    } else { // bi
      parts.push(...enSectionWavs[si])
      if (hasSilence) parts.push(SILENCE_700_MP3)
      parts.push(...arSectionWavs[si])
    }
  }
  if (hasOutro && parts.length > 0 && !MUSIC_FILES.has(parts[parts.length - 1])) {
    parts.push(OUTRO_MP3)
  }
  return parts
}

// One-shot ffmpeg per variant: decodes WAV TTS chunks + MP3 music, optionally
// crossfades the last two inputs (last TTS ↔ outro), encodes the whole result
// to MP3 once. All inputs are 24 kHz mono so the concat filter joins them
// without implicit resampling.
function stitchVariant(audioParts, outPath) {
  const willCrossfadeOutro = hasOutro
    && audioParts.length >= 2
    && audioParts[audioParts.length - 1] === OUTRO_MP3
  const ffArgs = ['-y']
  for (const p of audioParts) ffArgs.push('-i', p)

  const N = audioParts.length
  let filterComplex
  if (willCrossfadeOutro) {
    const headCount = N - 2
    if (headCount > 0) {
      const headLabels = Array.from({ length: headCount }, (_, i) => `[${i}:a]`).join('')
      filterComplex =
        `${headLabels}concat=n=${headCount}:v=0:a=1[head];` +
        `[${N - 2}:a][${N - 1}:a]acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri[tail];` +
        `[head][tail]concat=n=2:v=0:a=1[out]`
    } else {
      filterComplex = `[0:a][1:a]acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri[out]`
    }
  } else {
    const labels = Array.from({ length: N }, (_, i) => `[${i}:a]`).join('')
    filterComplex = N > 1
      ? `${labels}concat=n=${N}:v=0:a=1[out]`
      : `[0:a]anull[out]`
  }

  ffArgs.push(
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'libmp3lame', '-b:a', '64k',
    '-ar', '24000', '-ac', '1',
    '-write_xing', '1',
    outPath
  )

  const ff = spawnSync('ffmpeg', ffArgs, { encoding: 'utf-8', timeout: 180000 })
  if (ff.status !== 0) {
    // Fail fast — the previous fallback (raw Buffer.concat of MP3 bytes) shipped a
    // worse-corrupted file than the failure it caught. Better to log loudly and
    // skip publishing audio for the day than to deploy a broken MP3.
    throw new Error(`ffmpeg merge failed: ${ff.stderr?.slice(0, 500)}`)
  }
}

function probeDuration(path) {
  try {
    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', path
    ], { encoding: 'utf-8' })
    return Math.round(parseFloat(probe.stdout.trim()) || 0)
  } catch {
    return 0
  }
}

const variantsToBuild = arSectionWavs ? ['en', 'ar', 'bi'] : ['en']
const variantDurations = {}
for (const variant of variantsToBuild) {
  const parts = buildVariantParts(variant)
  const outPath = join(AUDIO_DIR, `briefing-${today}-${variant}.mp3`)
  console.log(`\nStitching ${variant}: ${parts.length} parts → ${basename(outPath)}`)
  stitchVariant(parts, outPath)
  variantDurations[variant] = probeDuration(outPath)
  console.log(`  ${variant} duration: ${variantDurations[variant]}s`)
}

// Backwards-compat: legacy mobile builds still fetch `briefing-${date}.mp3`
// and build.js historically used the same filename as its freshness check.
// Mirror the EN variant to that name so older clients keep working through
// at least one mobile release cycle.
const legacyMp3 = join(AUDIO_DIR, `briefing-${today}.mp3`)
cpSync(join(AUDIO_DIR, `briefing-${today}-en.mp3`), legacyMp3)
console.log(`Legacy mirror: ${basename(legacyMp3)}`)

// Clean up temp WAV chunks (whole .tmp tree, including per-section subdirs)
try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}

// Write metadata. The `voice` and `duration` fields are kept at the top level
// for backwards compat with any older mobile/build code; the canonical source
// going forward is `variants[lang].duration` and `voices[lang]`.
const metaPath = join(AUDIO_DIR, 'briefing-meta.json')
writeFileSync(metaPath, JSON.stringify({
  date: today,
  generated: new Date().toISOString(),
  articles: articles.length,
  voice: VOICE_EN,
  voices: arSectionWavs ? { en: VOICE_EN, ar: VOICE_AR } : { en: VOICE_EN },
  ssmlLength: ssml.length,
  ssmlLengthAr: arSsml ? arSsml.length : 0,
  duration: variantDurations.en,
  variants: Object.fromEntries(variantsToBuild.map(v => [v, { duration: variantDurations[v] }])),
}, null, 2))
console.log(`Metadata saved: ${metaPath}`)

// Clean up MP3s and SSML transcripts older than 7 days. Filename shapes:
//   briefing-YYYY-MM-DD.mp3            (legacy mirror of EN)
//   briefing-YYYY-MM-DD-{en,ar,bi}.mp3 (new variants)
//   briefing-YYYY-MM-DD.ssml           (EN transcript)
//   briefing-YYYY-MM-DD-ar.ssml        (AR transcript)
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
for (const f of readdirSync(AUDIO_DIR)) {
  const m = f.match(/^briefing-(\d{4}-\d{2}-\d{2})(?:-[a-z]+)?\.(mp3|ssml)$/)
  if (!m) continue
  if (new Date(m[1]).getTime() < sevenDaysAgo) {
    unlinkSync(join(AUDIO_DIR, f))
    console.log(`Cleaned up old briefing: ${f}`)
  }
}

console.log('\nDone.')
