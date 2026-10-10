// Run: node --test scripts/lib/briefing-script.test.js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { briefingPrompt, ffmpegFailure, parseBriefingScript, scriptToSsml, splitForSynthesis, spokenWords, unheardSentences } from './briefing-script.js'
import { ROOT } from './paths.js'

const SCRIPT = `This is your briefing for the twenty-sixth of September, twenty twenty-six.
<long pause>
Russian attacks on Kyiv killed five people on Friday.
---
In politics. <short pause>
All four of Iraq's airports have stopped flights to and from Iran.
<long pause>
That's your briefing.`

test('sections split at --- lines, pause tags kept', () => {
  const { sections } = parseBriefingScript(SCRIPT)
  assert.equal(sections.length, 2)
  assert.match(sections[0], /^This is your briefing/)
  assert.match(sections[1], /^In politics\. <short pause>/)
  assert.match(sections[1], /<long pause>\nThat's your briefing\.$/)
})

test('a fenced reply is unwrapped', () => {
  const { sections } = parseBriefingScript(`\`\`\`text\n${SCRIPT}\n\`\`\``)
  assert.equal(sections.length, 2)
  assert.ok(!sections[1].includes('```'))
})

test('an SSML reply from the old prompt still becomes a script', () => {
  const ssml = `<speak>
<s>This is your briefing for today.</s>
<break time="1s"/>
<prosody rate="95%"><s>The lead story.</s></prosody>
<p>
<s>In politics.</s><break time="400ms"/>
<s><sub alias="the World Health Organization">WHO</sub> met.</s>
</p>
<p>
<s>On the economy.</s><break time="400ms"/><s>Rates held.</s>
</p>
</speak>`
  const { sections } = parseBriefingScript(ssml)
  assert.equal(sections.length, 3)
  assert.match(sections[0], /today\.\s*<long pause>\s*The lead story\./)
  assert.match(sections[1], /In politics\.\s*<short pause>\s*the World Health Organization met\./)
  assert.ok(sections.every(s => !/<(?!(short|long) pause>)/.test(s)))
})

// The 2026-09-26 17:23 run: Gemini 3.8 Flash skipped the US Army / Cuba
// story in the middle of the politics section and returned success.
const SKIPPED = `Saudi air defences brought down two Houthi drones aimed at Riyadh, along with two ballistic missiles fired at Khamis Mushait, home to a major air base.
<long pause>
An internal US Army message asks whether the Army Reserve can supply Southern Command with military police, medics and support units within a hundred and twenty days. These aren't strike forces — they're the units an army needs to hold territory and run it — and US officials link the request to planning on Cuba, though the message never names the island.
<long pause>
Russian attacks on Kyiv killed five people, one of them a child, and injured forty-three, as a daytime drone struck an office building in the Solomianskyi district.`
const HEARD = `Saudi air defenses brought down two Houthi drones aimed at Riyadh, along with two ballistic missiles fired at Khamis Mushait, home to a major air base. Russian attacks on Kyiv killed five people, one of them a child, and injured forty-three, as a daytime drone struck an office building in the Solomians Key district.`

test('a skipped story is found sentence by sentence', () => {
  const missing = unheardSentences(SKIPPED, HEARD)
  assert.equal(missing.length, 2)
  assert.match(missing[0], /^An internal US Army message/)
  assert.match(missing[1], /^These aren't strike forces/)
})

test('a faithful read passes despite spelling and digits', () => {
  // "defenses" for "defences", "43" for "forty-three", a mis-split place name.
  const faithful = SKIPPED.replace(/<[^>]+>/g, ' ').replace('defences', 'defenses').replace('forty-three', '43')
  assert.deepEqual(unheardSentences(SKIPPED, faithful), [])
})

test('sections split at story boundaries into requests of one or two stories', () => {
  const story = (n) => `Story ${n} ${'word '.repeat(90)}ends.`
  const section = `In politics. <short pause>\n${story(1)}\n<long pause>\n${story(2)}\n<long pause>\n${story(3)}`
  const pieces = splitForSynthesis(section, 1200)
  assert.equal(pieces.length, 2)
  assert.match(pieces[0], /^In politics\. <short pause>\nStory 1 .*\n<long pause>\nStory 2 /s)
  assert.match(pieces[1], /^Story 3 /)
  assert.ok(pieces.every((p) => p.length <= 1200))
  assert.deepEqual(splitForSynthesis('One short story.'), ['One short story.'])
})

test('pause tags are markup, not words', () => {
  assert.deepEqual(spokenWords('In politics. <short pause> Rates held.'), ['in', 'politics', 'rates', 'held'])
})

test('Chirp fallback: pauses become breaks, text is escaped, pieces fit the byte limit', () => {
  const [one] = scriptToSsml('Profits & losses. <short pause> Next. <long pause> End.')
  assert.equal(one, '<speak>Profits &amp; losses. <break time="400ms"/> Next. <break time="700ms"/> End.</speak>')
  const long = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
  const pieces = scriptToSsml(long, 1000)
  assert.ok(pieces.length > 1)
  for (const p of pieces) {
    assert.ok(Buffer.byteLength(p, 'utf-8') <= 1000)
    assert.match(p, /^<speak>.*\.<\/speak>$/)
  }
})

// ── The prompt ───────────────────────────────────────────────────────

const PROMPT = readFileSync(join(ROOT, 'scripts', 'briefing-prompt.md'), 'utf-8')

// The data is put in place of one sentence of `briefing-prompt.md`. Reword that
// sentence and this fails here, where it used to fail at 05:25 by sending the
// model a prompt with no articles in it and reading out what came back.
test('the day\'s articles go into the prompt, where the prompt says they will be', () => {
  const payload = { articles: [{ title: 'Fed Raises Rates', body: 'Washington — The Fed raised rates.' }], hoursUntilNext: 24, isFriday: false }
  const prompt = briefingPrompt(PROMPT, payload)
  assert.ok(prompt.includes(`Here is the article data as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nThe JSON object contains:\n- \`articles\`: today's articles`))
  assert.ok(!prompt.includes('are provided inline below by the system'))
  assert.equal(prompt.length, PROMPT.length - 'The article data and editorial context are provided inline below by the system. The JSON object contains:'.length + `Here is the article data as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nThe JSON object contains:`.length, 'nothing else moved')
})

test('a prompt with no place for the articles is an error, not a prompt without them', () => {
  assert.throws(() => briefingPrompt(PROMPT.replace('provided inline below', 'given below'), { articles: [] }), /no longer has the sentence the article data replaces/)
  assert.throws(() => briefingPrompt('', {}), /no longer has the sentence/)
})

// In a replacement *string* these are patterns: `$'` is everything after the
// match, so one such article pasted the rest of the prompt into the data.
test('an article with a dollar pattern in it goes in as it was written', () => {
  for (const body of ["priced in US$'s", 'paid in $& kind', 'big $$ deal', 'a `$` sign and $`', 'worth $150 billion, or $1']) {
    const prompt = briefingPrompt(PROMPT, { articles: [{ body }] })
    assert.ok(prompt.includes(JSON.stringify(body)), body)
    assert.equal(prompt.split('The JSON object contains:').length, 2, `the prompt was not pasted into itself by ${body}`)
  }
})

// ── The mux ──────────────────────────────────────────────────────────

test('an ffmpeg failure is the end of what it said, not its banner', () => {
  const banner = `ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers\n  built with gcc 13\n  configuration: ${'--enable-something '.repeat(100)}\n`
  const said = `${banner}[in#3 @ 0x55d] Error opening input: No such file or directory\nError opening input file /root/zuhd.news/content/audio/.tmp/chunk-3.wav.\n`
  const line = ffmpegFailure({ status: 254, stderr: said })
  assert.ok(line.endsWith('Error opening input file /root/zuhd.news/content/audio/.tmp/chunk-3.wav.'))
  assert.ok(line.length <= 500 && !line.includes('ffmpeg version'))
  assert.equal(said.slice(0, 500).includes('Error'), false, 'the first 500 characters, which is what was logged, say nothing of it')
})

test('an ffmpeg that was not found, ran out of time or said nothing is named as that', () => {
  assert.equal(ffmpegFailure({ status: null, stderr: '', error: Object.assign(new Error('spawnSync ffmpeg ETIMEDOUT'), { code: 'ETIMEDOUT' }) }), 'timed out')
  assert.equal(ffmpegFailure({ status: null, error: Object.assign(new Error('spawnSync ffmpeg ENOENT'), { code: 'ENOENT' }) }), 'spawnSync ffmpeg ENOENT')
  assert.equal(ffmpegFailure({ status: 1, stderr: ' \n' }), 'exit 1 with nothing on stderr')
})
