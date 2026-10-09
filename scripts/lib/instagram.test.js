// Run: node --test scripts/lib/instagram.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { graphClient, publishStory } from './instagram.js'
import { postLog } from './post-log.js'

const dir = mkdtempSync(join(tmpdir(), 'instagram-'))
const TOKEN = 'not-a-token'
const FEED = 'https://zuhd.news/api/ig/2026-10-08-a.jpg'
const STORY = 'https://zuhd.news/api/ig/2026-10-08-a.story.jpg'
const ARTICLE = 'https://zuhd.news/a/2026-10-08-a'

/** @param {any} body @param {{ ok?: boolean, status?: number, type?: string }} [over] */
const answer = (body, { ok = true, status = 200, type = 'application/json' } = {}) => ({ ok, status, headers: { get: () => type }, json: async () => body })
const REFUSED = answer({ error: { message: 'Only photo or video can be accepted as media type.' } }, { ok: false, status: 400 })

/**
 * Instagram, standing in: every request is kept, and answered by the first
 * rule whose pattern its `METHOD url` matches; a rule with several answers
 * gives them in turn.
 *
 * @param {[RegExp, ...any[]][]} [rules] ahead of the ones for a post that goes well
 */
function instagram(rules = []) {
  /** @type {{ url: string, init: any }[]} */
  const requests = []
  /** @type {number[]} */
  const waits = []
  let containers = 0
  /** @type {[RegExp, ...any[]][]} */
  const all = [
    ...rules,
    [/^HEAD /, answer(null, { type: 'image/jpeg' })],
    [/^POST .*\/123\/media$/, () => answer({ id: `container-${++containers}` })],
    [/^GET .*\?fields=status_code$/, answer({ status_code: 'FINISHED' })],
    [/^POST .*\/media_publish$/, (/** @type {any} */ init) => answer({ id: `media-of-${new URLSearchParams(init.body).get('creation_id')}` })],
    [/^POST .*\/comments$/, answer({ id: 'comment-1' })],
  ]
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
    requests.push({ url, init })
    const rule = all.find(([pattern]) => pattern.test(`${init.method ?? 'GET'} ${url}`))
    if (!rule) throw new Error(`no answer for ${init.method ?? 'GET'} ${url}`)
    const next = rule.length > 2 ? rule.splice(1, 1)[0] : rule[1]
    const res = typeof next === 'function' ? next(init) : next
    if (res instanceof Error) throw res
    return res
  }
  const api = graphClient({ userId: '123', token: TOKEN, fetch: /** @type {any} */ (fetch), wait: async (ms) => waits.push(ms) })
  return { api, requests, waits }
}

/** @param {string} name */
const logAt = (name) => postLog('instagramLog', { path: join(dir, `${name}.json`) })
/** @param {Partial<Parameters<typeof publishStory>[2]>} [over] */
const story = (over = {}) => ({ slug: '2026-10-08-a', headline: 'A Headline', writeCaption: async () => 'A caption.', feedUrl: FEED, storyUrl: STORY, articleUrl: ARTICLE, ...over })

test('a story goes out as a feed post with its caption, a first comment and a Story', async () => {
  const { api, requests } = instagram()
  const log = logAt('whole')
  const entry = await publishStory(api, log, story())
  assert.deepEqual({ ...entry, timestamp: 't' }, { timestamp: 't', slug: '2026-10-08-a', headline: 'A Headline', caption: 'A caption.', mediaId: 'media-of-container-1', commentId: 'comment-1', storyMediaId: 'media-of-container-2', sent: true })
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'whole.json'), 'utf8')), [entry], 'and the log holds what it returned, in the order it always wrote the keys')
  const posted = requests.filter((r) => r.init.method === 'POST').map((r) => [r.url.replace(/^.*v21\.0\//, ''), Object.fromEntries(new URLSearchParams(r.init.body))])
  assert.deepEqual(posted, [
    ['123/media', { image_url: FEED, caption: 'A caption.', access_token: TOKEN }],
    ['123/media_publish', { creation_id: 'container-1', access_token: TOKEN }],
    ['media-of-container-1/comments', { message: ARTICLE, access_token: TOKEN }],
    ['123/media', { image_url: STORY, media_type: 'STORIES', access_token: TOKEN }],
    ['123/media_publish', { creation_id: 'container-2', access_token: TOKEN }],
  ])
})

// A URL is the part of a request that proxies and servers write down.
test('the token is never in a URL, and every call has a deadline', async () => {
  const { api, requests } = instagram()
  await publishStory(api, logAt('token'), story())
  assert.ok(requests.length >= 8)
  for (const { url, init } of requests) {
    assert.ok(!url.includes(TOKEN), `the token is in ${url}`)
    assert.ok(init.signal instanceof AbortSignal, `no deadline on ${init.method ?? 'GET'} ${url}`)
  }
  const polls = requests.filter((r) => r.url.includes('fields=status_code'))
  assert.deepEqual(polls.map((r) => r.init.headers), [{ Authorization: `Bearer ${TOKEN}` }, { Authorization: `Bearer ${TOKEN}` }], 'a GET has no body: the header carries it')
})

// The step runs under `timeout 90`. Killed between the post and a record
// written last, the post was live and the log said it had never been made.
test('the post is in the log as soon as it is out, before the comment and the Story', async () => {
  const path = join(dir, 'early.json')
  /** @type {any[]} */
  const seen = []
  const look = (/** @type {any} */ res) => () => {
    seen.push(JSON.parse(readFileSync(path, 'utf8')))
    return res
  }
  const { api } = instagram([[/^POST .*\/comments$/, look(answer({ id: 'comment-1' }))], [/^POST .*\/123\/media$/, answer({ id: 'container-1' }), look(answer({ id: 'container-2' }))]])
  const log = postLog('instagramLog', { path })
  const entry = await publishStory(api, log, story())
  assert.equal(seen.length, 2, 'the log as it stood on disk when the comment was posted, and when the Story was begun')
  for (const onDisk of seen) {
    assert.deepEqual(onDisk.map((/** @type {any} */ e) => [e.slug, e.mediaId, e.commentId, e.storyMediaId, e.sent]), [['2026-10-08-a', 'media-of-container-1', null, null, true]])
  }
  assert.equal(postLog('instagramLog', { path }).has('2026-10-08-a'), true)
  assert.deepEqual([entry.commentId, entry.storyMediaId], ['comment-1', 'media-of-container-2'], 'and amended once both are done')
})

test('a comment or a Story that fails costs neither the post nor its record', async () => {
  const { api } = instagram([[/^POST .*\/comments$/, answer({ error: { message: 'comments are limited' } }, { ok: false, status: 400 })], [/^POST .*\/123\/media$/, answer({ id: 'container-1' }), new Error('fetch failed')]])
  const entry = await publishStory(api, logAt('partial'), story())
  assert.deepEqual([entry.sent, entry.mediaId, entry.commentId, entry.storyMediaId], [true, 'media-of-container-1', null, null])
})

// 2026-10-08 10:04: the HEAD saw the image, Instagram's fetcher did not, and
// the story was not posted.
test('a container Instagram could not read the image for is made once more, after a wait', async () => {
  const once = instagram([[/^POST .*\/123\/media$/, REFUSED, answer({ id: 'container-1' }), answer({ id: 'container-2' })]])
  const entry = await publishStory(once.api, logAt('retry'), story())
  assert.equal(entry.sent, true)
  assert.deepEqual(once.waits, [10_000])
  assert.equal(once.requests.filter((r) => r.url.endsWith('/123/media')).length, 3, 'two tries at the feed container, one at the Story')

  const twice = instagram([[/^POST .*\/123\/media$/, REFUSED, REFUSED, answer({ id: 'never' })]])
  const log = logAt('refused-twice')
  await assert.rejects(publishStory(twice.api, log, story()), /Only photo or video/)
  assert.deepEqual(log.entries.map((e) => [e.sent, e.error, e.caption]), [[false, 'Only photo or video can be accepted as media type.', 'A caption.']], 'the failure is recorded, with the caption that was written')
  assert.equal(log.has('2026-10-08-a'), false)

  const other = instagram([[/^POST .*\/123\/media$/, answer({ error: { message: 'Application request limit reached' } }, { ok: false, status: 400 })]])
  await assert.rejects(publishStory(other.api, logAt('limit'), story()), /request limit/)
  assert.deepEqual(other.waits, [], 'any other refusal is not tried again')
})

test('the caption is written while the image is waited for', async () => {
  /** @type {string[]} */
  const order = []
  /** @type {(value: string) => void} */
  let finish = () => {}
  const { api } = instagram([
    [
      /^HEAD /,
      () => {
        order.push('looked for the image')
        return answer(null, { type: 'image/jpeg' })
      },
    ],
  ])
  const writeCaption = () => {
    order.push('began the caption')
    return new Promise((/** @type {(value: string) => void} */ resolve) => {
      finish = resolve
    })
  }
  const publishing = publishStory(api, logAt('overlap'), story({ writeCaption }))
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(order, ['began the caption', 'looked for the image'], 'both under way before either is done')
  finish('Late caption.')
  assert.equal((await publishing).caption, 'Late caption.')
})

test('the image is waited for until it is one, and no longer than six looks', async () => {
  const html = answer(null, { type: 'text/html' })
  const soon = instagram([[/^HEAD /, html, new Error('fetch failed'), answer(null, { ok: false, status: 404, type: 'image/jpeg' }), answer(null, { type: 'image/jpeg' })]])
  assert.equal(await soon.api.waitForPublicImage(FEED), true)
  assert.deepEqual(soon.waits, [5000, 5000, 5000])
  const never = instagram([[/^HEAD /, html]])
  assert.equal(await never.api.waitForPublicImage(FEED), false)
  assert.deepEqual([never.requests.length, never.waits.length], [6, 5])
})

test('a container is waited for, a look that fails learns nothing, and one in error stops the post', async () => {
  const slow = instagram([[/^GET .*status_code$/, answer({ status_code: 'IN_PROGRESS' }), new Error('The operation was aborted due to timeout'), answer({ status_code: 'FINISHED' })]])
  await slow.api.waitForContainer('container-1')
  assert.deepEqual(slow.waits, [1500, 1500])
  const broken = instagram([[/^GET .*status_code$/, answer({ status_code: 'ERROR' })]])
  await assert.rejects(broken.api.waitForContainer('container-1'), /container processing failed/)
  const silent = instagram([[/^GET .*status_code$/, answer({})]])
  await silent.api.waitForContainer('container-1')
  assert.equal(silent.requests.length, 6, 'after six looks the publish is left to say what is wrong')
})
