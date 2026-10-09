#!/usr/bin/env node
// Merges the API feed and the RSS feed into the selector's pool: the full feed
// for the stages after the selector, and a copy without source text for the
// selector itself. What is merged, cut and split is `lib/merge-feeds.js`.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { pathOf } from './lib/datasets.js'
import { writeJson } from './lib/json-file.js'
import { mergeFeeds, stripBodies } from './lib/merge-feeds.js'
import { runStage } from './lib/stage.js'

/**
 * A missing or unreadable feed is a fetch that failed, and the other one still
 * makes a cycle: run-cycle.sh stops only when both did.
 *
 * @param {string} path
 * @returns {import('./lib/schema.js').FeedItem[]}
 */
function loadFeed(path) {
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return data.stories || []
  } catch { return [] }
}

/**
 * The stage, over the locations `at` names: `pathOf` in a cycle, a directory
 * of its own in a test.
 *
 * @param {(name: 'feedApi' | 'feedRss' | 'feed' | 'feedSlim' | 'feedSnapshotsMerged') => string} at
 */
export function merge(at) {
  const now = Date.now()
  // The selector's copy goes first. The cycle clears the full feed when it
  // starts and nothing cleared this one, so a merge that failed left the
  // selector the pool of the cycle before, under a prompt that calls it this
  // cycle's, and its picks then matched nothing in a feed that was not there.
  rmSync(at('feedSlim'), { force: true })
  const api = loadFeed(at('feedApi'))
  const rss = loadFeed(at('feedRss'))
  const { multiSourceStories, nicheStories, capMs, counts } = mergeFeeds(api, rss, now)

  const output = {
    fetchedAt: new Date(now).toISOString(),
    apiStories: api.length,
    rssStories: rss.length,
    multiSourceStories,
    nicheStories,
  }
  writeJson(at('feed'), output)

  const slimOutput = {
    ...output,
    multiSourceStories: stripBodies(multiSourceStories),
    nicheStories: stripBodies(nicheStories),
  }
  writeJson(at('feedSlim'), slimOutput)

  // Archive merged (post-RSS-merge, pre-prefilter) snapshot for replay/backtest.
  // fetch-news-api.js already snapshots its output, but that one is API-only —
  // the niche-RSS sources that the layer-4 recap rule targets only enter here.
  try {
    const SNAP_DIR = at('feedSnapshotsMerged')
    mkdirSync(SNAP_DIR, { recursive: true })
    const ts = output.fetchedAt.replace(/:/g, '-').replace(/\..+/, '').slice(0, 16)
    writeJson(join(SNAP_DIR, `${ts}.json`), slimOutput)
    // Rotation: this directory had none and reached 700 files / 86 MB by
    // 2026-09-25, five a day. The narrators read a 14-day window
    // (lib/coverage-window.js); 45 days leaves replay-recap-dedup a backtest
    // month on top. Older snapshots up to 2026-08-09 remain in git history.
    const KEEP_DAYS = 45
    const cutoff = new Date(now - KEEP_DAYS * 86400000).toISOString().slice(0, 10)
    for (const f of readdirSync(SNAP_DIR)) {
      if (f.endsWith('.json') && f.slice(0, 10) < cutoff) unlinkSync(join(SNAP_DIR, f))
    }
  } catch (err) {
    console.error(`merged-snapshot write failed: ${/** @type {Error} */ (err).message}`)
  }

  const cap = (capMs / 3_600_000).toFixed(1)
  console.log(`${counts.multi} multi + ${counts.niche} niche (${counts.headlineOnly} headline-only, ${counts.stale} stale >${cap}h dropped)`)
  // On stderr, which is what run-cycle.sh keeps in the cycle log.
  console.error(`Pool age cut: ${cap}h (${counts.usable} usable stories)`)
  return { counts }
}

export const main = () => merge(pathOf)

await runStage(import.meta, 'merge-feeds', main)
