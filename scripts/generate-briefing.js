#!/usr/bin/env node
// zuhd.news daily audio briefing generator
// Three stages: collect articles → Claude SSML → Google TTS MP3

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync, statSync, cpSync, rmdirSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import textToSpeech from '@google-cloud/text-to-speech'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const AUDIO_DIR = join(ROOT, 'content', 'audio')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'briefing-prompt.md')

// Voice config — easy to swap after testing
const VOICE_NAME = 'en-US-Chirp3-HD-Enceladus'

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
  articles.push({
    title: meta.title || basename(file, '.md'),
    category: meta.category || 'uncategorised',
    source: meta.source || '',
    addedTime,
    body: body.slice(0, 300) // trimmed to keep prompt compact
  })
}

// Keep the 20 most recent articles — enough for a full briefing
articles.sort((a, b) => b.addedTime - a.addedTime)
if (articles.length > 20) {
  console.log(`Trimmed from ${articles.length} to 20 articles (most recent)`)
  articles = articles.slice(0, 20)
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
    '--model', process.env.ZUHD_BRIEFING_MODEL || 'opus',
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

// --- Stage 3: Synthesize MP3 via Google TTS ---
console.log('\n=== Stage 3: Synthesizing audio ===')

mkdirSync(AUDIO_DIR, { recursive: true })

// Google TTS Chirp3-HD supports up to 5000 bytes per request.
// Fewer chunks = no MP3 header concatenation glitches on mobile players.
const MAX_BYTES = 4800
const innerSsml = ssml.replace(/^<speak>\s*/, '').replace(/\s*<\/speak>\s*$/, '')
const segments = innerSsml.split(/(?=<break\s[^>]*\/>)/)

const chunks = []
let current = ''
for (const seg of segments) {
  if (Buffer.byteLength(`<speak>${current}${seg}</speak>`, 'utf-8') > MAX_BYTES && current) {
    chunks.push(`<speak>${current}</speak>`)
    current = seg
  } else {
    current += seg
  }
}
if (current) chunks.push(`<speak>${current}</speak>`)

console.log(`Split into ${chunks.length} chunk(s) for synthesis`)

const client = new textToSpeech.TextToSpeechClient()
const tmpDir = join(AUDIO_DIR, '.tmp')
mkdirSync(tmpDir, { recursive: true })
const chunkPaths = []

for (let i = 0; i < chunks.length; i++) {
  console.log(`  Synthesizing chunk ${i + 1}/${chunks.length} (${Buffer.byteLength(chunks[i], 'utf-8')} bytes)`)
  const [response] = await client.synthesizeSpeech({
    input: { ssml: chunks[i] },
    voice: { languageCode: 'en-US', name: VOICE_NAME },
    audioConfig: {
      audioEncoding: 'MP3',
      sampleRateHertz: 24000,
      effectsProfileId: ['headphone-class-device']
    }
  })
  const chunkPath = join(tmpDir, `chunk-${i}.mp3`)
  writeFileSync(chunkPath, Buffer.from(response.audioContent))
  chunkPaths.push(chunkPath)
}

// Merge chunks into a single clean MP3 via ffmpeg (avoids header duplication glitches)
const mp3Path = join(AUDIO_DIR, `briefing-${today}.mp3`)
if (chunkPaths.length === 1) {
  cpSync(chunkPaths[0], mp3Path)
} else {
  const concatList = join(tmpDir, 'concat.txt')
  writeFileSync(concatList, chunkPaths.map(p => `file '${p}'`).join('\n'))
  const ff = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c', 'copy', mp3Path
  ], { encoding: 'utf-8', timeout: 30000 })
  if (ff.status !== 0) {
    console.error('ffmpeg merge failed:', ff.stderr?.slice(0, 200))
    // Fallback: raw concatenation (better than nothing)
    writeFileSync(mp3Path, Buffer.concat(chunkPaths.map(p => readFileSync(p))))
  }
}
// Clean up temp chunks
for (const p of chunkPaths) try { unlinkSync(p) } catch {}
try { unlinkSync(join(tmpDir, 'concat.txt')) } catch {}
try { rmdirSync(tmpDir) } catch {}
console.log(`Audio saved: ${mp3Path}`)

// Write metadata
const metaPath = join(AUDIO_DIR, 'briefing-meta.json')
writeFileSync(metaPath, JSON.stringify({
  date: today,
  generated: new Date().toISOString(),
  articles: articles.length,
  voice: VOICE_NAME,
  ssmlLength: ssml.length
}, null, 2))
console.log(`Metadata saved: ${metaPath}`)

// Clean up MP3s and SSML transcripts older than 7 days
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
for (const f of readdirSync(AUDIO_DIR)) {
  if (!f.startsWith('briefing-') || !(f.endsWith('.mp3') || f.endsWith('.ssml'))) continue
  const dateStr = f.replace('briefing-', '').replace(/\.(mp3|ssml)$/, '')
  if (new Date(dateStr).getTime() < sevenDaysAgo) {
    unlinkSync(join(AUDIO_DIR, f))
    console.log(`Cleaned up old briefing: ${f}`)
  }
}

console.log('\nDone.')
