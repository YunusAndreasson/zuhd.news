// Gemini TTS for the audio briefing, over the Gemini API's Interactions
// endpoint, plus the transcription call that checks what it said.
//
// Settings follow ai.google.dev/gemini-api/docs/speech-generation (read
// 2026-09-26, "Last updated 2026-09-24"):
// - `input` is a verbatim transcript; sustained delivery goes in one short
//   `speech_metadata.style` string, reused unchanged for every section —
//   the guide names long "Director's Notes" style blocks as the most common
//   cause of voice drift, and says to reuse one short string for a
//   consistent baseline.
// - Pauses are the documented inline tags `<short pause>` / `<long pause>`.
// - Unary responses are `audio/wav` (RIFF, 16-bit mono PCM, 24 kHz by
//   default) — the rate the briefing's music beds and ffmpeg concat expect.
// - Output is capped at 16,384 tokens per request; measured at ~32 audio
//   tokens a second that is ~8.5 minutes, so the briefing is synthesised a
//   section at a time, never whole.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts'
export const GEMINI_TTS_VOICE = 'Charon'
export const GEMINI_TTS_STYLE = 'calm, measured newsreader'
const TRANSCRIBE_MODEL = 'gemini-3.8-flash'

/** The key, under either name: `.env` carries it as `GEMINI`. */
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GEMINI || ''

async function post(path, body, timeoutMs) {
  const res = await fetch(`${ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try { detail = JSON.parse(text).error?.message || detail } catch {}
    throw new Error(`HTTP ${res.status}: ${detail}`)
  }
  return JSON.parse(text)
}

/**
 * One section of the script → WAV bytes.
 * @param {string} text
 * @returns {Promise<{ wav: Buffer, audioTokens: number }>}
 */
export async function synthesizeGemini(text) {
  const json = await post('interactions', {
    model: GEMINI_TTS_MODEL,
    input: [{
      type: 'user_input',
      content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: GEMINI_TTS_STYLE }] }],
    }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: GEMINI_TTS_VOICE }] },
  }, 240_000)
  if (json.status !== 'completed') throw new Error(`interaction status ${json.status}`)
  const audio = (json.steps || []).flatMap((s) => s.content || []).find((c) => c.type === 'audio' && c.data)
  if (!audio) throw new Error('no audio in the response')
  const wav = Buffer.from(audio.data, 'base64')
  if (wav.subarray(0, 4).toString() !== 'RIFF') throw new Error(`expected WAV, got ${audio.mime_type}`)
  const audioTokens = (json.usage?.output_tokens_by_modality || [])
    .filter((m) => m.modality === 'audio').reduce((n, m) => n + (m.tokens || 0), 0)
  return { wav, audioTokens }
}

/**
 * What the audio actually says, numbers as words so it compares with a
 * script that has no digits.
 * @param {Buffer} wav
 */
export async function transcribeGemini(wav) {
  const json = await post(`models/${TRANSCRIBE_MODEL}:generateContent`, {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'audio/wav', data: wav.toString('base64') } },
        { text: 'Transcribe this audio verbatim. Write numbers as words. Output only the spoken words.' },
      ],
    }],
  }, 120_000)
  return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
}
