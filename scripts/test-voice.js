#!/usr/bin/env node
// Voice A/B testing tool for zuhd.news audio briefing
// Usage: node scripts/test-voice.js [voice-name]
// Without args: tests all Chirp 3 HD voices
// With arg: tests just that voice, e.g. node scripts/test-voice.js Fenrir

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import textToSpeech from '@google-cloud/text-to-speech'

const ROOT = new URL('..', import.meta.url).pathname
const OUT_DIR = join(ROOT, 'content', 'audio', 'voice-tests')

const VOICES = ['Charon', 'Fenrir', 'Orus', 'Puck', 'Aoede', 'Kore', 'Leda', 'Zephyr']

const TEST_SSML = `<speak>
From <phoneme alphabet="ipa" ph="zʊhd">zuhd</phoneme> news, this is your daily briefing for <say-as interpret-as="date" format="dmy">15022026</say-as>.
<break time="1s"/>
In global politics. <emphasis level="moderate">The European Union</emphasis> approved a landmark defense spending package worth <say-as interpret-as="cardinal">150</say-as> billion euros, marking the bloc's largest joint military investment.
<break time="600ms"/>
<emphasis level="moderate">India</emphasis> halted all crude oil purchases from Russia, responding to new sanctions pressure from Western allies.
<break time="900ms"/>
In technology. <emphasis level="moderate">The Pentagon</emphasis> announced expanded use of artificial intelligence in battlefield logistics, drawing scrutiny from civil liberties groups.
<break time="1s"/>
That's your briefing from <phoneme alphabet="ipa" ph="zʊhd">zuhd</phoneme> news.
</speak>`

const requestedVoice = process.argv[2]
const voicesToTest = requestedVoice
  ? [requestedVoice]
  : VOICES

mkdirSync(OUT_DIR, { recursive: true })

const client = new textToSpeech.TextToSpeechClient()

for (const voice of voicesToTest) {
  const voiceName = `en-US-Chirp3-HD-${voice}`
  console.log(`Synthesizing: ${voiceName}...`)

  try {
    const [response] = await client.synthesizeSpeech({
      input: { ssml: TEST_SSML },
      voice: { languageCode: 'en-US', name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        effectsProfileId: ['large-home-entertainment-class-device']
      }
    })

    const outPath = join(OUT_DIR, `test-${voice.toLowerCase()}.mp3`)
    writeFileSync(outPath, response.audioContent, 'binary')
    console.log(`  Saved: ${outPath}`)
  } catch (err) {
    console.error(`  Failed: ${voiceName} — ${err.message}`)
  }
}

console.log('\nDone. Listen and compare the files in content/audio/voice-tests/')
