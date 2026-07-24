// Dev watcher: runs the SSG once, spawns `wrangler pages dev`, and
// re-runs the build on any source change. wrangler watches `dist/` for
// changes and live-reloads the browser, so all we have to do is keep
// `dist/` current.
//
// Watched roots:
//   public/                   — style.css, island-loader.js, islands/*.ts
//   templates/                — article.html, index.html, country.html
//   scripts/build*.js         — build.js + scripts/build/*
//   shared/                   — country data, types, geo, fonts
//   content/articles/*.md     — article markdown
//   content/.story-ledger.json + .context-briefs.json — story arcs
//
// Skips: node_modules, dist, .cache, .git, *.swp, .DS_Store.
//
// Run with: SKIP_OG=1 node scripts/watch.js
// (SKIP_OG=1 is the default rebuild — flip it off if you want OG images
// to regenerate on every save, but cold-cache OG is ~3 minutes.)

import { spawn } from 'child_process'
import { watch as fsWatch } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const NODE = process.execPath

const ROOTS = [
  'public',
  'templates',
  'scripts/build',
  'shared',
  'content/articles',
]
const FILES = [
  'scripts/build.js',
  'content/.story-ledger.json',
  'content/.context-briefs.json',
]
const IGNORE = /(?:^|\/)(?:node_modules|dist|\.cache|\.git)(?:\/|$)|\.swp$|\.DS_Store$/

let buildQueued = false
let buildRunning = false
let pendingChange = null

const runBuild = () => {
  if (buildRunning) {
    buildQueued = true
    return
  }
  buildRunning = true
  const start = Date.now()
  const reason = pendingChange || 'initial'
  pendingChange = null
  console.log(`\n[watch] rebuild (${reason})…`)
  const proc = spawn(NODE, [join(ROOT, 'scripts/build.js')], {
    cwd: ROOT,
    env: { ...process.env, SKIP_OG: process.env.SKIP_OG ?? '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  proc.on('exit', (code) => {
    buildRunning = false
    const ms = Date.now() - start
    if (code === 0) {
      console.log(`[watch] rebuild done · ${ms}ms`)
    } else {
      console.log(`[watch] rebuild FAILED (exit ${code}) · ${ms}ms`)
    }
    if (buildQueued) {
      buildQueued = false
      runBuild()
    }
  })
}

let debounceTimer = null
const scheduleBuild = (path) => {
  pendingChange = path
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runBuild, 150)
}

const watchPath = (rel) => {
  const abs = join(ROOT, rel)
  try {
    fsWatch(abs, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const full = `${rel}/${filename}`
      if (IGNORE.test(full)) return
      scheduleBuild(full)
    })
  } catch (err) {
    console.warn(`[watch] cannot watch ${rel}: ${err.message}`)
  }
}

// Initial build (synchronous from the user's perspective — we wait for
// it before spawning wrangler so the browser doesn't load a half-empty
// dist/).
const initialBuild = () =>
  new Promise((resolve) => {
    console.log('[watch] initial build…')
    const start = Date.now()
    const proc = spawn(NODE, [join(ROOT, 'scripts/build.js')], {
      cwd: ROOT,
      env: { ...process.env, SKIP_OG: process.env.SKIP_OG ?? '1' },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    proc.on('exit', (code) => {
      console.log(`[watch] initial build ${code === 0 ? 'done' : `FAILED (${code})`} · ${Date.now() - start}ms`)
      resolve(code)
    })
  })

await initialBuild()

// Spawn wrangler. Keep it foregrounded; killing watch.js takes wrangler
// with it via the SIGINT trap.
const wrangler = spawn('npx', ['wrangler', 'pages', 'dev', 'dist'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
})

const cleanup = () => {
  if (!wrangler.killed) wrangler.kill('SIGINT')
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
wrangler.on('exit', () => process.exit(0))

// Start watchers AFTER initial build + wrangler boot.
for (const r of ROOTS) watchPath(r)
for (const f of FILES) watchPath(f)
console.log(`[watch] watching ${ROOTS.length} dirs + ${FILES.length} files. Save a source file to trigger rebuild.`)
