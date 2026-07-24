// Shared utilities for autoresearch replay drivers.
// Worktree management, /tmp staging, Claude CLI invocation matching production.
//
// Production CLI args mirror scripts/run-cycle.sh so that replays reflect what
// the live cycle would do. Models pinned by ID (no aliases) for the same
// reason as run-cycle.sh: comparable iteration deltas across a session.

import { spawnSync } from 'child_process'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SANDBOX_ROOT = '/tmp/zuhd-autoresearch'

// --- Pinned model IDs (do not use aliases — see CLAUDE.md memory) ---
export const MODELS = {
  selector: 'claude-opus-5',
  writer: 'claude-sonnet-5',
  editor: 'claude-sonnet-5',
  judgeOpus: 'claude-opus-5',
  judgeSonnet: 'claude-sonnet-5',
}

// --- Worktree lifecycle ---

export function makeSandbox(sessionId, iterId) {
  const path = join(SANDBOX_ROOT, sessionId, String(iterId))
  mkdirSync(path, { recursive: true })
  return path
}

export function createWorktree(sandboxPath) {
  const wt = join(sandboxPath, 'repo')
  if (existsSync(wt)) removeWorktree(wt)
  const res = spawnSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  if (res.status !== 0) {
    throw new Error(`git worktree add failed: ${res.stderr || res.stdout}`)
  }
  // node_modules is .gitignored, so the fresh worktree has none — every
  // pipeline script that imports from it would crash on first require.
  // Symlink to the main repo's node_modules; safe because nothing in the
  // worktree mutates it.
  const wtModules = join(wt, 'node_modules')
  if (!existsSync(wtModules)) {
    try {
      symlinkSync(join(REPO_ROOT, 'node_modules'), wtModules, 'dir')
    } catch (err) {
      throw new Error(`worktree node_modules symlink failed: ${err.message}`)
    }
  }
  return wt
}

export function removeWorktree(wt) {
  const res = spawnSync('git', ['worktree', 'remove', '--force', wt], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  if (res.status !== 0) {
    // Fall back to rm -rf and worktree prune; worktree may already be gone
    try { rmSync(wt, { recursive: true, force: true }) } catch {}
    spawnSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT })
  }
}

// --- Diff application (unique-substring replace, same shape the proposer emits) ---

export function applyDiff(worktree, diff) {
  const target = join(worktree, diff.file)
  if (!existsSync(target)) throw new Error(`diff target missing: ${diff.file}`)
  const original = readFileSync(target, 'utf-8')
  const idx = original.indexOf(diff.oldString)
  if (idx === -1) throw new Error(`oldString not found in ${diff.file}`)
  const lastIdx = original.lastIndexOf(diff.oldString)
  if (idx !== lastIdx) throw new Error(`oldString not unique in ${diff.file}`)
  const next = original.slice(0, idx) + diff.newString + original.slice(idx + diff.oldString.length)
  writeFileSync(target, next)
}

// --- /tmp staging for stages that read absolute paths ---

const TMP_PATHS = [
  '/tmp/zuhd-feed.json',
  '/tmp/zuhd-feed-slim.json',
  '/tmp/zuhd-feed-api.json',
  '/tmp/zuhd-feed-rss.json',
  '/tmp/zuhd-selection.json',
  '/tmp/zuhd-new-articles.txt',
  '/tmp/zuhd-trends-digest.json',
]

export function clearTmpStaging() {
  for (const p of TMP_PATHS) {
    try { rmSync(p, { force: true }) } catch {}
  }
}

export function stageFeed(feedSnapshotPath) {
  // Snapshot is the API-side feed (NewsAPI events); we synthesize the merged
  // and slim feeds without invoking merge-feeds.js (which would reject stories
  // older than 48h, killing replays of older snapshots).
  const snap = JSON.parse(readFileSync(feedSnapshotPath, 'utf-8'))
  const stories = (snap.stories || []).map((s) => ({ ...s, origin: s.origin || 'api' }))
  const multi = stories.filter((s) => (s.sources || []).length > 1)
  const niche = stories.filter((s) => (s.sources || []).length === 1)
  const merged = {
    fetchedAt: snap.fetchedAt || new Date().toISOString(),
    apiStories: stories.length,
    rssStories: 0,
    multiSourceStories: multi,
    nicheStories: niche,
  }
  writeFileSync('/tmp/zuhd-feed.json', JSON.stringify(merged, null, 2))
  const stripBodies = (arr) => arr.map((s) => ({
    ...s,
    sources: (s.sources || []).map(({ body, ...rest }) => rest),
  }))
  writeFileSync(
    '/tmp/zuhd-feed-slim.json',
    JSON.stringify({ ...merged, multiSourceStories: stripBodies(multi), nicheStories: stripBodies(niche) }, null, 2),
  )
}

export function stageTrendsDigest(trendsSnapshotPath) {
  // The selector + edu-context expect a digest at /tmp/zuhd-trends-digest.json.
  // For v1 we write a minimal one derived from the snapshot. Not all keys are
  // populated — edu-context's prompt section is best-effort and skips missing.
  if (!trendsSnapshotPath || !existsSync(trendsSnapshotPath)) {
    writeFileSync('/tmp/zuhd-trends-digest.json', JSON.stringify({ indicators: [] }))
    return
  }
  const snap = JSON.parse(readFileSync(trendsSnapshotPath, 'utf-8'))
  const indicators = []
  for (const [id, ind] of Object.entries(snap.indicators || {})) {
    if (!ind || !Array.isArray(ind.series) || ind.series.length === 0) continue
    const last = ind.series[ind.series.length - 1]
    indicators.push({
      id,
      label: ind.label || id,
      unit: ind.unit || '',
      lastValue: last?.value ?? null,
      lastDate: last?.date ?? null,
    })
  }
  writeFileSync('/tmp/zuhd-trends-digest.json', JSON.stringify({ indicators }, null, 2))
}

// --- Claude CLI invocation matching production stage args ---

export function runClaude({ prompt, model, allowedTools, maxTurns, timeoutSec, cwd, env }) {
  const fullEnv = { ...process.env, ...(env || {}) }
  // Production runs without CLAUDECODE so the headless CLI is honored
  delete fullEnv.CLAUDECODE
  const args = [
    '--no-session-persistence',
    '--effort', 'medium',
    '--model', model,
    '--allowedTools', allowedTools,
    '--max-turns', String(maxTurns),
    '--exclude-dynamic-system-prompt-sections',
    '-p', prompt,
  ]
  const res = spawnSync('claude', args, {
    cwd: cwd || REPO_ROOT,
    env: fullEnv,
    encoding: 'utf-8',
    timeout: timeoutSec * 1000,
    maxBuffer: 20 * 1024 * 1024,
  })
  return {
    exitCode: res.status ?? -1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs: 0, // not tracked here; caller can wrap with Date.now()
  }
}

// --- Find new article files inside a worktree (matches run-cycle.sh's logic) ---

export function findNewArticles(worktree) {
  const diff = spawnSync('git', ['diff', '--name-only', 'content/articles/'], {
    cwd: worktree,
    encoding: 'utf-8',
  })
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', 'content/articles/'], {
    cwd: worktree,
    encoding: 'utf-8',
  })
  const set = new Set(
    [...(diff.stdout || '').split('\n'), ...(untracked.stdout || '').split('\n')]
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return [...set].sort()
}

export function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}
