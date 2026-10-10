// Instagram's side of the breaking post: the Graph API calls, and the order
// the post, its record, the comment and the Story are made in.
//
// `post-to-instagram.js` keeps the credentials, the caption's wording and the
// dry run. This is the part that could only be tried against Instagram, on a
// `fetch` and a clock a test can supply.

const GRAPH = 'https://graph.facebook.com/v21.0'

/** One Graph call. An image container is made, read or published in a second or two. */
const CALL_TIMEOUT_MS = 15_000
/** One look at the deployed image. */
const HEAD_TIMEOUT_MS = 5_000
/** How long Instagram is given before the one second try at a container. */
const RETRY_AFTER_MS = 10_000

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The Graph API as the poster uses it.
 *
 * Every call has a deadline. None had: a call that hung held the stage until
 * the cycle's `timeout 90` killed it, which is the kill `publishStory` below
 * is written around.
 *
 * The token rides in the body of a POST. The one GET has no body, so there it
 * is a header; it was in the URL (`…?fields=status_code&access_token=…`),
 * which is the part of a request that ends up in other people's logs.
 *
 * @param {{ userId: string, token: string, fetch?: typeof fetch, wait?: (ms: number) => Promise<unknown> }} opts
 *   `fetch` and `wait` are for a test
 */
export function graphClient({ userId, token, fetch: request = fetch, wait = sleep }) {
  /**
   * @param {string} path
   * @param {Record<string, string>} params
   * @returns {Promise<Record<string, any>>}
   */
  async function graphPost(path, params) {
    const res = await request(`${GRAPH}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.error) {
      const err = json?.error?.message || `HTTP ${res.status}`
      throw new Error(err)
    }
    return json
  }

  /**
   * Image containers finish almost instantly, but poll a few times to be safe.
   * A look that fails is a look that learnt nothing: the publish that follows
   * surfaces a clear error if the container truly isn't ready.
   *
   * @param {string} creationId
   */
  async function waitForContainer(creationId) {
    for (let i = 0; i < 6; i++) {
      /** @type {Record<string, any>} */
      let json = {}
      try {
        const res = await request(`${GRAPH}/${creationId}?fields=status_code`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        })
        json = await res.json().catch(() => ({}))
      } catch {
        /* a deadline or a dropped connection: look again */
      }
      if (json?.status_code === 'FINISHED') return
      if (json?.status_code === 'ERROR') throw new Error('container processing failed')
      // Said once a poll, so a token the header does not carry shows in the log.
      if (json?.error?.message) console.error(`post-to-instagram: container status — ${json.error.message}`)
      await wait(1500)
    }
  }

  /**
   * Wait until the deployed image URL is actually live at the CDN edge before
   * asking Instagram to fetch it. The poster runs seconds after `wrangler
   * pages deploy`, and Instagram's fetchers frequently hit the URL before
   * Cloudflare has propagated the new file: they get a 404 HTML page and
   * reject the container with "Only photo or video can be accepted as media
   * type". Polling HEAD until we see a real image closes most of that race.
   *
   * @param {string} url
   * @param {number} [tries]
   * @param {number} [delayMs]
   */
  async function waitForPublicImage(url, tries = 6, delayMs = 5000) {
    for (let i = 0; i < tries; i++) {
      try {
        const res = await request(url, { method: 'HEAD', signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) })
        const ct = res.headers.get('content-type') || ''
        if (res.ok && ct.startsWith('image/')) return true
      } catch {
        /* transient — deploy still propagating */
      }
      if (i < tries - 1) await wait(delayMs)
    }
    return false
  }

  /**
   * Publish a single image (feed or story). Returns the published media id.
   *
   * The container is tried a second time, once, when Instagram says it was
   * given no image. The HEAD above is answered by the edge nearest this
   * server and Instagram asks another: on 2026-10-08 the wait saw the image
   * and the container was refused all the same, and that story was not
   * posted. One post in the last hundred.
   *
   * @param {{ imageUrl: string, mediaType?: string, extra?: Record<string, string> }} opts
   * @returns {Promise<string>}
   */
  async function publishImage({ imageUrl, mediaType, extra = {} }) {
    const create = () => graphPost(`${userId}/media`, { image_url: imageUrl, ...(mediaType ? { media_type: mediaType } : {}), ...extra })
    let container
    try {
      container = await create()
    } catch (e) {
      if (!/only photo or video/i.test(/** @type {Error} */ (e).message)) throw e
      console.error(`post-to-instagram: ${/** @type {Error} */ (e).message} — trying the container once more in ${RETRY_AFTER_MS / 1000}s`)
      await wait(RETRY_AFTER_MS)
      container = await create()
    }
    await waitForContainer(container.id)
    const published = await graphPost(`${userId}/media_publish`, { creation_id: container.id })
    return published.id
  }

  return { graphPost, waitForContainer, waitForPublicImage, publishImage }
}

/** @typedef {ReturnType<typeof graphClient>} GraphClient */

/**
 * Post the story: the feed image with its caption, the article's URL as the
 * first comment, and the Story.
 *
 * The record is written as soon as the feed post is out, and amended after
 * the comment and the Story. It was written once, at the end, after both: up
 * to about twenty seconds in which the post was live and the log did not know.
 * The step runs under `timeout 90`, a kill there reaches no `catch`, and the
 * log is the only thing that stops a second run posting the story again.
 *
 * The caption is written while the image is waited for. It was written
 * first, in up to thirty seconds of its own, and the wait began after.
 *
 * @param {Pick<GraphClient, 'graphPost' | 'waitForPublicImage' | 'publishImage'>} api
 * @param {import('./post-log.js').PostLog} log
 * @param {{ slug: string, headline: string, writeCaption: () => Promise<string>, feedUrl: string, storyUrl: string, articleUrl: string }} story
 * @returns {Promise<Record<string, any>>} the entry, as the log holds it
 */
export async function publishStory(api, log, { slug, headline, writeCaption, feedUrl, storyUrl, articleUrl }) {
  // 0. Wait out CDN propagation so IG doesn't fetch the URL before it's live.
  const [caption, live] = await Promise.all([writeCaption(), api.waitForPublicImage(feedUrl)])
  if (!live) console.error(`post-to-instagram: ${feedUrl} not yet a live image after wait — attempting publish anyway.`)

  // 1. Feed post (the caption rides on the container, not media_publish).
  let mediaId
  try {
    mediaId = await api.publishImage({ imageUrl: feedUrl, extra: { caption } })
  } catch (e) {
    // Record the failure so we can see it in the log; the runner says it and
    // ends the step on 1.
    try {
      log.add({ timestamp: new Date().toISOString(), slug, headline, caption, sent: false, error: String(/** @type {Error} */ (e).message) })
    } catch {
      /* ignore */
    }
    throw e
  }
  console.log(`post-to-instagram: posted feed ${mediaId}`)
  /** @type {Record<string, any>} */
  const entry = log.add({ timestamp: new Date().toISOString(), slug, headline, caption, mediaId, commentId: null, storyMediaId: null, sent: true })

  // 2. First comment: the article URL (feed captions can't carry a live link).
  try {
    const c = await api.graphPost(`${mediaId}/comments`, { message: articleUrl })
    entry.commentId = c.id
  } catch (e) {
    console.error(`post-to-instagram: first-comment failed (non-fatal) — ${/** @type {Error} */ (e).message}`)
  }

  // 3. Story cross-post (image-only). Independent of the feed post's success.
  try {
    entry.storyMediaId = await api.publishImage({ imageUrl: storyUrl, mediaType: 'STORIES' })
    console.log(`post-to-instagram: posted story ${entry.storyMediaId}`)
  } catch (e) {
    console.error(`post-to-instagram: story cross-post failed (non-fatal) — ${/** @type {Error} */ (e).message}`)
  }

  log.save()
  return entry
}
