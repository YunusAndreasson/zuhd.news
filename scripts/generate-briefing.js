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
const VOICE_NAME = 'en-US-Chirp3-HD-Charon'

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
    concepts: Array.isArray(meta.concepts) ? meta.concepts.slice(0, 3) : [],
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

// Pre-recorded audio: intro jingle before the bulletin, transition between sections.
// Files must be 24kHz mono MP3 to match TTS output (see public/audio/).
const INTRO_MP3 = join(ROOT, 'public', 'audio', 'intro.mp3')
const TRANSITION_MP3 = join(ROOT, 'public', 'audio', 'transition.mp3')
const OUTRO_MP3 = join(ROOT, 'public', 'audio', 'outro.mp3')
const hasIntro = existsSync(INTRO_MP3)
const hasTransition = existsSync(TRANSITION_MP3)
const hasOutro = existsSync(OUTRO_MP3)

if (hasIntro) console.log('Using intro music (public/audio/intro.mp3)')
if (hasTransition) console.log('Using transition music between sections (public/audio/transition.mp3)')

// Split SSML into sections at <p> category boundaries.
// Structure: [intro+lead] [category <p>] [category <p>] ... [signoff]
// Transition music replaces the <break> tags between sections.
const innerSsml = ssml.replace(/^<speak>\s*/, '').replace(/\s*<\/speak>\s*$/, '')
const pBlocks = [...innerSsml.matchAll(/<p>[\s\S]*?<\/p>/g)]

// Each entry: { type: 'intro'|'category'|'signoff', ssml: string }
const ssmlSections = []
if (pBlocks.length === 0) {
  // No <p> structure — treat entire SSML as one section (fallback)
  ssmlSections.push({ type: 'intro', ssml: innerSsml })
} else {
  // Intro+lead: everything before first <p>, strip trailing inter-section break
  const introContent = innerSsml.slice(0, pBlocks[0].index)
    .replace(/\s*<break\s[^>]*\/>\s*$/, '').trim()
  if (introContent) ssmlSections.push({ type: 'intro', ssml: introContent })

  // Category sections (each <p>...</p> block)
  for (const block of pBlocks) {
    ssmlSections.push({ type: 'category', ssml: block[0] })
  }

  // Signoff: everything after last </p> — append to last category section
  // so TTS has enough context for natural pacing (tiny standalone chunks sound choppy)
  const lastBlock = pBlocks[pBlocks.length - 1]
  const signoffContent = innerSsml.slice(lastBlock.index + lastBlock[0].length).trim()
  if (signoffContent && ssmlSections.length > 0) {
    ssmlSections[ssmlSections.length - 1].ssml += '\n' + signoffContent
  } else if (signoffContent) {
    ssmlSections.push({ type: 'signoff', ssml: signoffContent })
  }
}

console.log(`Split SSML into ${ssmlSections.length} sections: ${ssmlSections.map(s => s.type).join(', ')}`)

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

// Chunk a section into ≤MAX_BYTES pieces, each wrapped in <speak>
function chunkSection(sectionSsml) {
  const segs = sectionSsml.split(/(?=<break\s[^>]*\/>)/)
  const result = []
  let current = ''
  for (const seg of segs) {
    if (Buffer.byteLength(`<speak>${current}${seg}</speak>`, 'utf-8') > MAX_BYTES && current) {
      const openTags = getOpenTags(current)
      const closeTags = openTags.reverse().map(t => `</${t.match(/<(\w+)/)[1]}>`)
      result.push(`<speak>${current}${closeTags.join('')}</speak>`)
      current = openTags.reverse().join('') + seg
    } else {
      current += seg
    }
  }
  if (current) result.push(`<speak>${current}</speak>`)
  return result
}

const client = new textToSpeech.TextToSpeechClient()
const tmpDir = join(AUDIO_DIR, '.tmp')
mkdirSync(tmpDir, { recursive: true })

// Build ordered list of audio parts: music files + synthesized TTS chunks
const audioParts = [] // file paths in final playback order
let chunkIdx = 0

for (let si = 0; si < ssmlSections.length; si++) {
  const section = ssmlSections[si]

  // Intro music before the first section
  if (si === 0 && hasIntro) {
    audioParts.push(INTRO_MP3)
  }

  // Transition music between sections (but not before signoff — too short, would feel abrupt)
  if (si > 0 && section.type !== 'signoff' && hasTransition) {
    audioParts.push(TRANSITION_MP3)
  }

  // Synthesize this section's TTS chunks
  const chunks = chunkSection(section.ssml)
  for (let ci = 0; ci < chunks.length; ci++) {
    console.log(`  Synthesizing ${section.type} ${si + 1}/${ssmlSections.length}, chunk ${ci + 1}/${chunks.length} (${Buffer.byteLength(chunks[ci], 'utf-8')} bytes)`)
    const [response] = await client.synthesizeSpeech({
      input: { ssml: chunks[ci] },
      voice: { languageCode: 'en-US', name: VOICE_NAME },
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
        effectsProfileId: ['headphone-class-device']
      }
    })
    const chunkPath = join(tmpDir, `chunk-${chunkIdx++}.mp3`)
    writeFileSync(chunkPath, Buffer.from(response.audioContent))
    audioParts.push(chunkPath)
  }
}

const MUSIC_FILES = new Set([INTRO_MP3, TRANSITION_MP3, OUTRO_MP3])
const musicCount = audioParts.filter(p => MUSIC_FILES.has(p)).length
console.log(`Total parts: ${audioParts.length} (${audioParts.length - musicCount} TTS, ${musicCount} music)`)

// Crossfade intro into the first TTS chunk: radio tuning fades out, voice fades in
const CROSSFADE_SEC = 2
if (audioParts[0] === INTRO_MP3 && audioParts.length > 1 && !MUSIC_FILES.has(audioParts[1])) {
  const crossfadePath = join(tmpDir, 'crossfade-intro.mp3')
  const cf = spawnSync('ffmpeg', [
    '-y', '-i', INTRO_MP3, '-i', audioParts[1],
    '-filter_complex', `acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri`,
    '-ar', '24000', '-ac', '1', '-b:a', '64k', crossfadePath
  ], { encoding: 'utf-8', timeout: 15000 })
  if (cf.status === 0) {
    console.log(`Crossfaded intro with first TTS section (${CROSSFADE_SEC}s overlap)`)
    try { unlinkSync(audioParts[1]) } catch {}
    audioParts.splice(0, 2, crossfadePath)
  } else {
    console.warn('Intro crossfade failed, falling back to simple concat:', cf.stderr?.slice(0, 150))
  }
}

// Crossfade last TTS chunk into outro: voice fades out, outro fades in
if (hasOutro && audioParts.length > 0) {
  const lastIdx = audioParts.length - 1
  if (!MUSIC_FILES.has(audioParts[lastIdx])) {
    audioParts.push(OUTRO_MP3)
    const crossfadePath = join(tmpDir, 'crossfade-outro.mp3')
    const cf = spawnSync('ffmpeg', [
      '-y', '-i', audioParts[lastIdx], '-i', OUTRO_MP3,
      '-filter_complex', `acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri`,
      '-ar', '24000', '-ac', '1', '-b:a', '64k', crossfadePath
    ], { encoding: 'utf-8', timeout: 15000 })
    if (cf.status === 0) {
      console.log(`Crossfaded last TTS section with outro (${CROSSFADE_SEC}s overlap)`)
      try { unlinkSync(audioParts[lastIdx]) } catch {}
      audioParts.splice(lastIdx, 2, crossfadePath)
    } else {
      console.warn('Outro crossfade failed, falling back to simple concat:', cf.stderr?.slice(0, 150))
    }
  }
}

// Merge all parts into a single clean MP3 via ffmpeg
const mp3Path = join(AUDIO_DIR, `briefing-${today}.mp3`)
const concatList = join(tmpDir, 'concat.txt')
writeFileSync(concatList, audioParts.map(p => `file '${p}'`).join('\n'))
const ff = spawnSync('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
  '-c', 'copy', mp3Path
], { encoding: 'utf-8', timeout: 30000 })
if (ff.status !== 0) {
  console.error('ffmpeg merge failed:', ff.stderr?.slice(0, 200))
  // Fallback: concat only TTS chunks without music
  const ttsPaths = audioParts.filter(p => !MUSIC_FILES.has(p))
  writeFileSync(mp3Path, Buffer.concat(ttsPaths.map(p => readFileSync(p))))
}

// Clean up temp TTS chunks
for (const p of audioParts) {
  if (!MUSIC_FILES.has(p)) try { unlinkSync(p) } catch {}
}
try { unlinkSync(concatList) } catch {}
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
  voice: VOICE_NAME,
  ssmlLength: ssml.length,
  duration: durationSec
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
