#!/usr/bin/env node
// zuhd.news daily audio briefing generator
// Three stages: collect articles → Claude script → Gemini TTS (Chirp 3 HD as
// the fallback voice) → MP3
//
// Usage: node scripts/generate-briefing.js [--out <dir>]
//   --out writes the script, MP3 and meta to <dir> instead of content/audio/,
//   for a test run that must not replace the day's published briefing.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync, statSync, rmdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import textToSpeech from '@google-cloud/text-to-speech'
import { argAt } from './lib/argv.js'
import { coverage, parseBriefingScript, scriptToSsml } from './lib/briefing-script.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, geminiKey, synthesizeGemini, transcribeGemini } from './lib/gemini-tts.js'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const AUDIO_DIR = argAt('out') || join(ROOT, 'content', 'audio')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'briefing-prompt.md')

// The fallback voice. The primary is Gemini TTS (lib/gemini-tts.js) since
// 2026-09-26; Chirp reads any section Gemini cannot, or everything when no
// Gemini key is set.
const CHIRP_VOICE = 'en-US-Chirp3-HD-Charon'

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
for (const a of articles) delete a.addedTime // strip internal field before sending to Claude

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

// Compute hours until next briefing — one a day, on the 05:00 UTC cycle
// (`DAILY_HOUR` in run-cycle.sh). Was [4, 16], from when there were two.
const BRIEFING_HOURS = [5]
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

// --- Stage 2: Write the spoken script via Claude CLI ---
console.log('\n=== Stage 2: Writing the bulletin script ===')

const promptTemplate = readFileSync(PROMPT_PATH, 'utf-8')
// Inline article data directly into the prompt to avoid tool-call round-trip
const prompt = promptTemplate.replace(
  /The article data and editorial context are provided inline below by the system\. The JSON object contains:/,
  `Here is the article data as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nThe JSON object contains:`
)
let claudeOutput
try {
  const env = { ...process.env }
  delete env.CLAUDECODE
  const result = spawnSync('claude', [
    '--model', process.env.ZUHD_BRIEFING_MODEL || 'claude-opus-5-5',
    '--effort', 'medium',
    '--no-session-persistence',
    '--max-turns', '1',
    '--output-format', 'json',
    '--exclude-dynamic-system-prompt-sections',
    '-p', prompt
  ], { encoding: 'utf-8', timeout: 720_000, maxBuffer: 4 * 1024 * 1024, env })
  if (result.status !== 0) {
    throw new Error(result.stderr || `Exit code ${result.status}`)
  }
  // Briefing returns a plain-text script (not JSON), so unwrap the envelope manually
  // instead of going through parseClaudeEnvelopeWithUsage which expects JSON.
  const envelope = JSON.parse(result.stdout.trim())
  if (envelope?.type !== 'result' || envelope.result == null) {
    throw new Error(`unexpected claude envelope: ${result.stdout.slice(0, 200)}`)
  }
  claudeOutput = String(envelope.result)
  if (envelope.total_cost_usd != null) {
    const cacheRead = envelope.usage?.cache_read_input_tokens ?? 0
    const cacheCreate = envelope.usage?.cache_creation_input_tokens ?? 0
    console.log(`Claude usage: $${envelope.total_cost_usd.toFixed(4)} in ${envelope.duration_ms ?? '?'}ms (cache read ${cacheRead}, create ${cacheCreate})`)
  }
} catch (err) {
  console.error('Claude CLI failed:', err.message)
  process.exit(1)
}

const { script, sections: scriptSections } = parseBriefingScript(claudeOutput)
if (scriptSections.length === 0) {
  console.error('Claude returned no script — skipping briefing.')
  process.exit(1)
}
console.log(`Script: ${script.length} characters, ${scriptSections.length} sections`)

// Saved beside the MP3 for review.
const scriptPath = join(AUDIO_DIR, `briefing-${today}.txt`)
writeFileSync(scriptPath, `${script}\n`)
console.log(`Script saved: ${scriptPath}`)

// --- Stage 3: Synthesize audio ---
console.log('\n=== Stage 3: Synthesizing audio ===')

mkdirSync(AUDIO_DIR, { recursive: true })

// Pre-recorded audio: transition between sections, outro after last section.
// Files must be 24kHz mono MP3 to match TTS output (see public/audio/).
const TRANSITION_MP3 = join(ROOT, 'public', 'audio', 'transition.mp3')
const OUTRO_MP3 = join(ROOT, 'public', 'audio', 'outro.mp3')
const hasTransition = existsSync(TRANSITION_MP3)
const hasOutro = existsSync(OUTRO_MP3)

if (hasTransition) console.log('Using transition music between sections (public/audio/transition.mp3)')

const client = new textToSpeech.TextToSpeechClient()
const tmpDir = join(AUDIO_DIR, '.tmp')
mkdirSync(tmpDir, { recursive: true })

// Chirp 3 HD, the fallback voice. Fail-soft per chunk: Google TTS rejects
// malformed SSML with `3 INVALID_ARGUMENT`, which once threw uncaught and lost
// the whole day's briefing (2026-06-12 04:00, category chunk 4/5). On
// rejection, retry once as plain text; if that fails too, return null so the
// caller drops just this chunk.
async function synthesizeChirp(ssml, label) {
  const audioConfig = {
    audioEncoding: 'LINEAR16',
    sampleRateHertz: 24000,
    effectsProfileId: ['headphone-class-device'],
  }
  // Typed explicitly: the generated protobuf interface takes enum-or-string
  // unions, and a bare object literal here resolves onto the callback overload
  // of synthesizeSpeech, whose return is void and cannot be destructured.
  const audioConfigTyped = /** @type {any} */ (audioConfig)
  const voice = { languageCode: 'en-US', name: CHIRP_VOICE }
  try {
    const [response] = await client.synthesizeSpeech({ input: { ssml }, voice, audioConfig: audioConfigTyped })
    return Buffer.from(response.audioContent)
  } catch (err) {
    console.error(`  ⚠ ${label}: SSML synthesis rejected (${err.message?.split('\n')[0]}) — retrying as plain text`)
    const plain = ssml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!plain) {
      console.error(`  ✗ ${label}: empty after strip — dropping chunk`)
      return null
    }
    try {
      const [response] = await client.synthesizeSpeech({
        input: { ssml: `<speak>${plain}</speak>` }, voice, audioConfig: audioConfigTyped,
      })
      return Buffer.from(response.audioContent)
    } catch (err2) {
      console.error(`  ✗ ${label}: plain-text retry also failed (${err2.message?.split('\n')[0]}) — dropping chunk`)
      return null
    }
  }
}

// Gemini TTS, checked. A model can skip text and still return success —
// Gemini 3.8 Flash-Lite dropped a whole lead story in testing (2026-09-26) —
// so each section is transcribed and compared with its script before it is
// used. Two attempts; a section that fails both is read by Chirp instead, so
// the day's briefing never loses a story to a silent skip.
const MIN_COVERAGE = 0.85
// The first run (2026-09-26, three days after launch) drew `503 high demand`
// on 2 of 5 sections. An overload gets a third attempt and a wait before
// each retry; a skipped read or any other error gets two attempts.
async function synthesizeGeminiChecked(text, label) {
  let overloaded = false
  for (let attempt = 1; attempt <= (overloaded ? 3 : 2); attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, overloaded ? 20_000 * (attempt - 1) : 2_000))
    try {
      const t0 = Date.now()
      const { wav, audioTokens } = await synthesizeGemini(text)
      const heard = await transcribeGemini(wav)
      const cov = coverage(text, heard)
      const secs = ((Date.now() - t0) / 1000).toFixed(0)
      if (cov >= MIN_COVERAGE) {
        console.log(`  ✓ ${label}: Gemini, ${audioTokens} audio tokens, ${(cov * 100).toFixed(0)}% of the script heard, ${secs}s`)
        return { wav, audioTokens }
      }
      console.error(`  ⚠ ${label}: Gemini attempt ${attempt} spoke ${(cov * 100).toFixed(0)}% of the script`)
    } catch (err) {
      overloaded = /HTTP (429|503)/.test(err.message)
      console.error(`  ⚠ ${label}: Gemini attempt ${attempt} failed (${err.message.split('\n')[0]})`)
    }
  }
  return null
}

const useGemini = Boolean(geminiKey())
if (!useGemini) console.warn('⚠ No Gemini key (GEMINI or GEMINI_API_KEY) — reading the whole briefing with Chirp 3 HD')

// The last section ends the briefing, so it carries the sign-off.
const sectionAudio = new Array(scriptSections.length)
let geminiAudioTokens = 0
const engines = new Set()
await runWithConcurrency(scriptSections.map((text, i) => ({ text, i })), 3, async ({ text, i }) => {
  const label = `section ${i + 1}/${scriptSections.length}`
  if (useGemini) {
    const got = await synthesizeGeminiChecked(text, label)
    if (got) {
      geminiAudioTokens += got.audioTokens
      engines.add('gemini')
      sectionAudio[i] = [got.wav]
      return
    }
    console.error(`  ↳ ${label}: reading it with Chirp 3 HD instead`)
  }
  const pieces = []
  const ssmlChunks = scriptToSsml(text)
  for (let ci = 0; ci < ssmlChunks.length; ci++) {
    const audio = await synthesizeChirp(ssmlChunks[ci], `${label}, chunk ${ci + 1}/${ssmlChunks.length}`)
    if (audio) pieces.push(audio)
  }
  if (pieces.length) engines.add('chirp')
  sectionAudio[i] = pieces
})

// Two seconds of silence after the last words, so the voice has finished
// before the outro crossfade begins (Chirp got this from a trailing <break>).
function silenceWav(seconds, rate = 24000) {
  const data = Buffer.alloc(Math.round(seconds * rate) * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

// Build ordered list of audio parts: music files + synthesized TTS chunks
const audioParts = [] // file paths in final playback order
let chunkIdx = 0
for (let si = 0; si < sectionAudio.length; si++) {
  const pieces = sectionAudio[si] || []
  if (pieces.length === 0) continue // section dropped — ship the rest
  if (audioParts.length > 0 && hasTransition) audioParts.push(TRANSITION_MP3)
  for (const wav of pieces) {
    const chunkPath = join(tmpDir, `chunk-${chunkIdx++}.wav`)
    writeFileSync(chunkPath, wav)
    audioParts.push(chunkPath)
  }
}
if (audioParts.length > 0) {
  const tail = join(tmpDir, `chunk-${chunkIdx++}.wav`)
  writeFileSync(tail, silenceWav(2))
  audioParts.push(tail)
}
if (useGemini) {
  console.log(`Gemini audio tokens: ${geminiAudioTokens} (≈$${(geminiAudioTokens * 9 / 1e6).toFixed(3)} at $9/M)`)
}

const MUSIC_FILES = new Set([TRANSITION_MP3, OUTRO_MP3])
const musicCount = audioParts.filter(p => MUSIC_FILES.has(p)).length
const ttsCount = audioParts.length - musicCount
console.log(`Total parts: ${audioParts.length} (${ttsCount} TTS, ${musicCount} music)`)

// Global-failure guard. Each section fail-softs (Gemini, then Chirp, then
// dropped) so one bad section never costs the briefing. But a GLOBAL failure — TTS billing disabled, revoked credentials,
// project-wide quota — makes EVERY chunk drop, and without this guard we'd mux
// the music beds into a ~6s voiceless MP3, commit it, deploy it, and push a
// briefing notification to users (2026-07-09→11: three identical 6s files
// shipped while GCP billing was off). If nothing synthesized, there is no
// briefing: fail loudly and skip publishing rather than ship silence.
if (ttsCount === 0) {
  console.error('✗ No TTS audio synthesized — every chunk was dropped (likely a')
  console.error('  global TTS failure: billing disabled, bad credentials, or quota).')
  console.error('  Skipping publish so no voiceless briefing ships. See errors above.')
  process.exit(1)
}

// Append outro for the crossfade-friendly path (single ffmpeg pass below
// folds the crossfade into the same filter graph as the concat — no
// intermediate MP3, so the only lossy encode is the final libmp3lame pass).
const CROSSFADE_SEC = 2
const willCrossfadeOutro = hasOutro
  && audioParts.length > 0
  && !MUSIC_FILES.has(audioParts[audioParts.length - 1])
if (willCrossfadeOutro) audioParts.push(OUTRO_MP3)

// One-shot ffmpeg: decodes WAV TTS chunks + MP3 music, optionally crossfades
// the last two inputs (last TTS ↔ outro), encodes the whole result to MP3
// once. All inputs are 24 kHz mono so the concat filter joins them without
// implicit resampling.
const mp3Path = join(AUDIO_DIR, `briefing-${today}.mp3`)
const ffArgs = ['-y']
for (const p of audioParts) ffArgs.push('-i', p)

const N = audioParts.length
let filterComplex
if (willCrossfadeOutro && N >= 2) {
  // [head]: concat first N-2 inputs (everything before the last TTS chunk).
  // [tail]: acrossfade between last TTS chunk and outro.
  // [out]:  concat [head] + [tail].
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
  mp3Path
)

const ff = spawnSync('ffmpeg', ffArgs, { encoding: 'utf-8', timeout: 120000 })
if (ff.status !== 0) {
  // Fail fast — the previous fallback (raw Buffer.concat of MP3 bytes) shipped a
  // worse-corrupted file than the failure it caught. Better to log loudly and
  // skip publishing audio for the day than to deploy a broken MP3.
  console.error('ffmpeg merge failed:', ff.stderr?.slice(0, 500))
  process.exit(1)
}

// Clean up temp TTS chunks
for (const p of audioParts) {
  if (!MUSIC_FILES.has(p)) try { unlinkSync(p) } catch {}
}
try { rmdirSync(tmpDir) } catch {}
console.log(`Audio saved: ${mp3Path}`)

// Get MP3 duration via ffprobe
let durationSec = 0
try {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path
  ], { encoding: 'utf-8' })
  durationSec = Math.round(parseFloat(probe.stdout.trim()) || 0)
  console.log(`Duration: ${durationSec}s`)
} catch {}

// Write metadata
const metaPath = join(AUDIO_DIR, 'briefing-meta.json')
writeFileSync(metaPath, JSON.stringify({
  date: today,
  generated: new Date().toISOString(),
  articles: articles.length,
  voice: engines.has('gemini') ? `${GEMINI_TTS_MODEL}/${GEMINI_TTS_VOICE}` : CHIRP_VOICE,
  engines: [...engines],
  scriptLength: script.length,
  duration: durationSec
}, null, 2))
console.log(`Metadata saved: ${metaPath}`)

// Clean up MP3s and scripts older than 7 days (.ssml: the pre-Gemini scripts)
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
for (const f of readdirSync(AUDIO_DIR)) {
  if (!/^briefing-\d{4}-\d{2}-\d{2}\.(mp3|ssml|txt)$/.test(f)) continue
  const dateStr = f.replace('briefing-', '').replace(/\.(mp3|ssml|txt)$/, '')
  if (new Date(dateStr).getTime() < sevenDaysAgo) {
    unlinkSync(join(AUDIO_DIR, f))
    console.log(`Cleaned up old briefing: ${f}`)
  }
}

console.log('\nDone.')
