// Run: node --test scripts/lib/social-post.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { postLog } from './post-log.js'
import { loadStory, postStory, writeCopy } from './social-post.js'

const dir = mkdtempSync(join(tmpdir(), 'social-post-'))

const ARTICLE = `---
title: "US Bars Microsoft From Green Card Scheme"
socialTitle: "Microsoft's shares fall 7.5% after US bars its green card sponsorships"
date: "2026-10-08T17:27:44Z"
category: "tech"
location: "Washington"
lat: 38.9
lng: "-77.04"
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/1"
---

Washington — [Microsoft](company:MSFT)'s shares fell 7.5% after the order.

Why it matters.
`

// The card is drawn from what the build drew the published one from: the
// headline with its quotes curled, the dek without the dateline.
test('a story is the article under the slug and the card drawn for it; no article, no story', () => {
  writeFileSync(join(dir, '2026-10-08-a.md'), ARTICLE)
  const story = loadStory('2026-10-08-a', { dir })
  assert.equal(story?.meta.title, 'US Bars Microsoft From Green Card Scheme')
  assert.equal(story?.body, "Washington — [Microsoft](company:MSFT)'s shares fell 7.5% after the order.\n\nWhy it matters.")
  assert.deepEqual(story?.card, {
    headline: 'Microsoft’s shares fall 7.5% after US bars its green card sponsorships',
    summary: "Microsoft's shares fell 7.5% after the order. Why it matters.",
    category: 'tech',
    date: '2026-10-08T17:27:44Z',
    location: 'Washington',
    lat: 38.9,
    lng: -77.04,
  })
  assert.equal(loadStory('2026-10-08-nobody', { dir }), null)
})

test('a story with no social headline takes the title, and one with no place has none', () => {
  writeFileSync(join(dir, '2026-10-08-b.md'), '---\ntitle: "Fed Raises Rates"\n---\n\nThe Fed raised rates.\n')
  assert.deepEqual(loadStory('2026-10-08-b', { dir })?.card, { headline: 'Fed Raises Rates', summary: 'The Fed raised rates.', category: null, date: undefined, location: null, lat: null, lng: null })
})

const story = { meta: { title: 'Fed Raises Rates' }, body: 'Washington — The Fed raised rates.\n\nSecond block.' }

test('the model is given the prompt file and then the title and the prose, and its answer comes back trimmed', async () => {
  /** @type {{ args: string[], opts: any }[]} */
  const calls = []
  const answer = await writeCopy('tweet-prompt.md', story, {
    who: 'post-to-twitter',
    call: async (args, opts) => {
      calls.push({ args, opts })
      return { status: 0, stdout: '\n  Fed raises rates by a quarter point.\nA second line.\n\n', stderr: '' }
    },
  })
  assert.equal(answer, 'Fed raises rates by a quarter point.\nA second line.')
  const [{ args, opts }] = calls
  assert.equal(args.at(-1), `${readFileSync(join(ROOT, 'scripts/tweet-prompt.md'), 'utf8')}\nFed Raises Rates\n\nWashington — The Fed raised rates.\n\nSecond block.`)
  assert.ok(!args.includes('--output-format'), 'the answer is prose, not an envelope')
  assert.deepEqual(opts, { timeout: 30_000, maxBuffer: 512 * 1024 })
})

test('a call that fails, or says nothing, is no copy', async () => {
  const fails = async () => ({ status: null, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }) })
  assert.equal(await writeCopy('tweet-prompt.md', story, { who: 'post-to-twitter', call: fails }), null)
  assert.equal(await writeCopy('tweet-prompt.md', story, { who: 'post-to-twitter', call: async () => ({ status: 0, stdout: ' \n', stderr: '' }) }), null)
})

// ── The runner ───────────────────────────────────────────────────────

/** A poster whose platform part records that it ran. @param {Partial<import('./social-post.js').Poster>} [over] */
const poster = (over = {}) => {
  /** @type {import('./social-post.js').PostContext[]} */
  const posted = []
  return {
    posted,
    log: 'tweetLog',
    haveCreds: true,
    noCreds: 'X_* credentials not set — skipping tweet.',
    done: 'already tweeted',
    post: async (/** @type {import('./social-post.js').PostContext} */ ctx) => {
      posted.push(ctx)
    },
    ...over,
  }
}
/** The files a run reads, in the scratch directory. @param {string} name */
const io = (name) => ({ openLog: () => postLog('tweetLog', { path: join(dir, `${name}.json`) }), load: (/** @type {string} */ slug) => loadStory(slug, { dir }) })

test('a story is posted with its article and the log it is checked against', async () => {
  const p = poster()
  const ended = await postStory('post-to-twitter', p, { slug: '2026-10-08-a', dryRun: false, ...io('posted') })
  assert.deepEqual(ended, { exitCode: 0 })
  assert.equal(p.posted.length, 1)
  assert.deepEqual([p.posted[0].slug, p.posted[0].dryRun, p.posted[0].story.meta.category, p.posted[0].log.entries], ['2026-10-08-a', false, 'tech', []])
})

test('without a slug, credentials or an article, nothing is posted', async () => {
  const none = poster()
  assert.deepEqual(await postStory('post-to-twitter', none, { slug: undefined, dryRun: false, ...io('none') }), { exitCode: 2, skipped: 'no slug' })
  const keyless = poster({ haveCreds: false })
  assert.deepEqual(await postStory('post-to-twitter', keyless, { slug: '2026-10-08-a', dryRun: false, ...io('none') }), { exitCode: 0, skipped: 'no credentials' })
  const unwritten = poster()
  assert.deepEqual(await postStory('post-to-twitter', unwritten, { slug: '2026-10-08-nobody', dryRun: false, ...io('none') }), { exitCode: 0, skipped: 'no article' })
  assert.deepEqual([none.posted, keyless.posted, unwritten.posted], [[], [], []])
})

test('a dry run goes through without credentials', async () => {
  const p = poster({ haveCreds: false })
  await postStory('post-to-twitter', p, { slug: '2026-10-08-a', dryRun: true, ...io('dry') })
  assert.deepEqual(p.posted.map((c) => c.dryRun), [true])
})

test('a story the log says has gone out is not posted again', async () => {
  writeFileSync(join(dir, 'sent.json'), JSON.stringify([{ slug: '2026-10-08-a', sent: true }]))
  const p = poster()
  assert.deepEqual(await postStory('post-to-twitter', p, { slug: '2026-10-08-a', dryRun: false, ...io('sent') }), { exitCode: 0, skipped: 'already tweeted' })
  assert.deepEqual(p.posted, [])
})

// The log is the only memory of what has gone out. Read as empty it would
// have let the story through a second time.
test('a log that cannot be read stops the post, and is not written over', async () => {
  writeFileSync(join(dir, 'cut.json'), '[{"slug": "2026-10-08-a", "sent": tr')
  const p = poster()
  assert.deepEqual(await postStory('post-to-twitter', p, { slug: '2026-10-08-a', dryRun: false, ...io('cut') }), { exitCode: 1, degraded: 'the log could not be read' })
  assert.deepEqual(p.posted, [])
  assert.equal(readFileSync(join(dir, 'cut.json'), 'utf8'), '[{"slug": "2026-10-08-a", "sent": tr')
})

// X answered "credits depleted" to every tweet from 2026-09-18 and each run
// ended on 0, which is what the cycle reads: 97 refusals, no warning line.
test('a post the platform refuses is in the log first, and then fails the step', async () => {
  const path = join(dir, 'refused.json')
  const p = poster({ post: async ({ slug, log }) => log.add({ slug, sent: false, error: 'credits depleted' }) })
  assert.deepEqual(await postStory('post-to-twitter', p, { slug: '2026-10-08-a', dryRun: false, ...io('refused') }), { exitCode: 1, degraded: 'credits depleted' })
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), [{ slug: '2026-10-08-a', sent: false, error: 'credits depleted' }])
  assert.equal(postLog('tweetLog', { path }).has('2026-10-08-a'), false, 'so the next cycle may try the story again')
})

test('an attempt that throws fails the step too, and one that went out does not', async () => {
  const thrown = poster({
    post: async () => {
      throw new Error('fetch failed')
    },
  })
  assert.deepEqual(await postStory('post-to-twitter', thrown, { slug: '2026-10-08-a', dryRun: false, ...io('throws') }), { exitCode: 1, degraded: 'fetch failed' })
  const sent = poster({ post: async ({ slug, log }) => log.add({ slug, tweetId: '1', sent: true }) })
  assert.deepEqual(await postStory('post-to-twitter', sent, { slug: '2026-10-08-a', dryRun: false, ...io('went-out') }), { exitCode: 0 })
})

// Each poster ends in `runPoster(import.meta, …)`, so importing one runs
// nothing: no slug is read, no log, no network. What this holds is that the
// two files load at all, which nothing else here starts them to find out.
test('the two posters can be imported, and importing one posts nothing', async () => {
  const before = process.exitCode
  for (const name of ['post-to-twitter', 'post-to-instagram']) {
    const module = await import(join(ROOT, 'scripts', `${name}.js`))
    assert.deepEqual(Object.keys(module), [], `${name} exports nothing and has run nothing`)
  }
  assert.equal(process.exitCode, before, 'a poster that had run with no slug would have set 2')
})
