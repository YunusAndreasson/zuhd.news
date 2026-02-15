#!/usr/bin/env node
// zuhd.news daily audio briefing generator
// Three stages: collect articles → Claude SSML → Google TTS MP3

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import textToSpeech from '@google-cloud/text-to-speech'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const AUDIO_DIR = join(ROOT, 'content', 'audio')
const PROMPT_PATH = join(ROOT, 'scripts', 'briefing-prompt.md')
const TMP_ARTICLES = '/tmp/zuhd-briefing-articles.json'

// Voice config — easy to swap after testing
const VOICE_NAME = 'en-US-Chirp3-HD-Charon'

const today = new Date().toISOString().slice(0, 10)

const parseFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: match[2].trim() }
}

// --- Stage 1: Collect articles from last 24h ---
console.log('=== Stage 1: Collecting articles ===')

const cutoff = Date.now() - 24 * 60 * 60 * 1000
const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md') && f !== 'example.md')

const articles = []
for (const file of files) {
  const raw = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  if (!meta.date) continue
  const articleTime = new Date(meta.date).getTime()
  if (articleTime < cutoff) continue
  articles.push({
    title: meta.title || basename(file, '.md'),
    category: meta.category || 'uncategorised',
    source: meta.source || '',
    body: body.slice(0, 500) // enough for summarization
  })
}

if (articles.length === 0) {
  console.log('No articles in last 24h — skipping briefing.')
  process.exit(0)
}

console.log(`Found ${articles.length} articles from last 24h`)
writeFileSync(TMP_ARTICLES, JSON.stringify(articles, null, 2))

// --- Stage 2: Generate SSML via Claude CLI ---
console.log('\n=== Stage 2: Generating SSML bulletin ===')

const prompt = readFileSync(PROMPT_PATH, 'utf-8')
let claudeOutput
try {
  const env = { ...process.env }
  delete env.CLAUDECODE
  const result = spawnSync('claude', [
    '--allowedTools', 'Read',
    '--model', 'sonnet',
    '-p', prompt
  ], { encoding: 'utf-8', timeout: 120_000, maxBuffer: 1024 * 1024, env })
  if (result.status !== 0) {
    throw new Error(result.stderr || `Exit code ${result.status}`)
  }
  claudeOutput = result.stdout
} catch (err) {
  console.error('Claude CLI failed:', err.message)
  process.exit(1)
}

// Extract SSML from output
let ssml
const ssmlMatch = claudeOutput.match(/<speak[\s\S]*?<\/speak>/)
if (ssmlMatch) {
  ssml = ssmlMatch[0]
  console.log(`SSML extracted (${ssml.length} characters)`)
} else {
  // Fallback: wrap plain text output in speak tags
  console.warn('No SSML tags found — using plain text fallback')
  const plainText = claudeOutput.replace(/<[^>]+>/g, '').trim()
  ssml = `<speak>${plainText}</speak>`
}

// --- Stage 3: Synthesize MP3 via Google TTS ---
console.log('\n=== Stage 3: Synthesizing audio ===')

mkdirSync(AUDIO_DIR, { recursive: true })

// Google TTS has a 5000-byte limit per request. Split SSML at <break> tags into chunks.
const MAX_BYTES = 4800 // leave headroom for <speak> wrapper
const innerSsml = ssml.replace(/^<speak>\s*/, '').replace(/\s*<\/speak>$/, '')
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
const audioBuffers = []

for (let i = 0; i < chunks.length; i++) {
  console.log(`  Synthesizing chunk ${i + 1}/${chunks.length} (${Buffer.byteLength(chunks[i], 'utf-8')} bytes)`)
  const [response] = await client.synthesizeSpeech({
    input: { ssml: chunks[i] },
    voice: { languageCode: 'en-US', name: VOICE_NAME },
    audioConfig: {
      audioEncoding: 'MP3',
      effectsProfileId: ['large-home-entertainment-class-device']
    }
  })
  audioBuffers.push(response.audioContent)
}

const mp3Path = join(AUDIO_DIR, `briefing-${today}.mp3`)
writeFileSync(mp3Path, Buffer.concat(audioBuffers.map(b => Buffer.from(b))))
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

// Clean up MP3s older than 7 days
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
for (const f of readdirSync(AUDIO_DIR)) {
  if (!f.startsWith('briefing-') || !f.endsWith('.mp3')) continue
  const dateStr = f.replace('briefing-', '').replace('.mp3', '')
  if (new Date(dateStr).getTime() < sevenDaysAgo) {
    unlinkSync(join(AUDIO_DIR, f))
    console.log(`Cleaned up old briefing: ${f}`)
  }
}

console.log('\nDone.')
