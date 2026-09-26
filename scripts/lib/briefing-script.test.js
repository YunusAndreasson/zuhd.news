// Run: node --test scripts/lib/briefing-script.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { coverage, parseBriefingScript, scriptToSsml, spokenWords } from './briefing-script.js'

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

test('coverage separates a faithful read from the 2026-09-26 Flash-Lite skip', () => {
  const { sections } = parseBriefingScript(SCRIPT)
  const whole = sections.join(' ')
  // A faithful read that writes one number as digits still clears the bar.
  const faithful = whole.replace('five people', '5 people').replace(/<[^>]+>/g, ' ')
  assert.ok(coverage(whole, faithful) >= 0.85)
  // The skip: date and lead gone, only the politics section spoken.
  assert.ok(coverage(whole, sections[1].replace(/<[^>]+>/g, ' ')) < 0.85)
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
