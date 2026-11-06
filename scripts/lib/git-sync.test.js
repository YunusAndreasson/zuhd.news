// Run: node --test scripts/lib/git-sync.test.js
//
// Against real repositories in a temporary directory: a bare `origin`, the
// box's clone and the owner's laptop clone. What the module settles is how git
// behaves (an autostash that comes back in conflict exits 0 and leaves markers
// in the file), so a stand-in for git would prove nothing.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { cycleOwns, gitReason, syncRemote, untrackedInTheWay } from './git-sync.js'

/** @param {string} cwd @param {...string} args */
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`)
  return r.stdout.trim()
}

/** @param {string} root @param {string} path @param {string} text */
function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** @param {string} root @param {string} path */
const read = (root, path) => readFileSync(join(root, path), 'utf8')

/** A clone with an identity and no signing, so a rebase can commit. @param {string} dir @param {string} name */
function clone(dir, name) {
  git(dir, 'clone', '-q', 'origin.git', name)
  const root = join(dir, name)
  for (const [k, v] of [['user.name', name], ['user.email', `${name}@example.com`], ['commit.gpgsign', 'false']]) git(root, 'config', k, v)
  return root
}

/**
 * Origin with one commit on `master`; the box and the laptop cloned from it.
 *
 * @param {Record<string, string>} files what the first commit holds
 */
function world(files) {
  const dir = mkdtempSync(join(tmpdir(), 'git-sync-test-'))
  git(dir, 'init', '-q', '--bare', 'origin.git')
  git(join(dir, 'origin.git'), 'symbolic-ref', 'HEAD', 'refs/heads/master')
  const seed = join(dir, 'seed')
  git(dir, 'init', '-q', seed)
  for (const [k, v] of [['user.name', 'seed'], ['user.email', 'seed@example.com'], ['commit.gpgsign', 'false']]) git(seed, 'config', k, v)
  git(seed, 'checkout', '-q', '-b', 'master')
  for (const [path, text] of Object.entries(files)) put(seed, path, text)
  git(seed, 'add', '-A')
  git(seed, 'commit', '-q', '-m', 'seed')
  git(seed, 'remote', 'add', 'origin', join(dir, 'origin.git'))
  git(seed, 'push', '-q', 'origin', 'master')
  const box = clone(dir, 'box')
  const laptop = clone(dir, 'laptop')
  return { dir, box, laptop, done: () => rmSync(dir, { recursive: true, force: true }) }
}

/** @param {string} root @param {string} message @param {Record<string, string>} files */
function commit(root, message, files) {
  for (const [path, text] of Object.entries(files)) put(root, path, text)
  git(root, 'add', ...Object.keys(files))
  git(root, 'commit', '-q', '-m', message)
}

/** The module, with its lines kept and no npm. @param {string} root */
function sync(root) {
  /** @type {string[]} */
  const said = []
  let installed = 0
  const result = syncRemote({ root, say: (line) => said.push(line), install: () => installed++ })
  const warnings = said.flatMap((block) => block.split('\n')).filter((line) => line.startsWith('WARNING: '))
  return { ...result, said: said.join('\n'), warnings, installed }
}

const BASE = { 'content/articles/a.md': 'one\n', 'mobile/app.ts': 'v1\n', 'package-lock.json': '{\n  "a": 1\n}\n' }

test('a pull over the laptop\'s commits and a push of the box\'s', () => {
  const w = world(BASE)
  try {
    commit(w.laptop, 'mobile: v2', { 'mobile/app.ts': 'v2\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    commit(w.box, 'Editorial cycle', { 'content/articles/b.md': 'two\n' })
    const r = sync(w.box)
    assert.deepEqual([r.pulled, r.pushed, r.ahead, r.warnings], [true, true, 0, []])
    assert.equal(read(w.box, 'mobile/app.ts'), 'v2\n')
    assert.equal(r.installed, 1)
  } finally {
    w.done()
  }
})

test('2026-11-02: the remote tracks files the box writes and never committed, and the box keeps its copies', () => {
  const w = world(BASE)
  try {
    // The box's snapshot, written this cycle, never tracked.
    put(w.box, 'content/.companies.json', '{"generated":"2026-11-06"}\n')
    const then = new Date('2026-11-06T18:09:53Z')
    utimesSync(join(w.box, 'content/.companies.json'), then, then)
    // The laptop's copy, a month old, committed in a sweep.
    commit(w.laptop, 'content: company data', { 'content/.companies.json': '{"generated":"2026-10-11"}\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    commit(w.box, 'Editorial cycle', { 'content/articles/b.md': 'two\n' })

    const r = sync(w.box)
    assert.deepEqual([r.pulled, r.pushed, r.ahead, r.warnings], [true, true, 0, []])
    assert.equal(read(w.box, 'content/.companies.json'), '{"generated":"2026-11-06"}\n', "the box's copy")
    assert.equal(statSync(join(w.box, 'content/.companies.json')).mtimeMs, then.getTime(), 'and its time')
    assert.equal(git(w.box, 'status', '--porcelain', '--', 'content/.companies.json'), 'M content/.companies.json')
    assert.match(r.said, /the remote now tracks 1 file\(s\) the cycle writes/)
  } finally {
    w.done()
  }
})

test('an untracked file in the way outside content/ is not the cycle\'s to replace', () => {
  const w = world(BASE)
  try {
    put(w.box, 'scripts/new.js', 'a stray copy\n')
    commit(w.laptop, 'Pipeline: new', { 'scripts/new.js': 'the real one\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    commit(w.box, 'Editorial cycle', { 'content/articles/b.md': 'two\n' })

    const r = sync(w.box)
    assert.equal(r.pulled, false)
    assert.equal(r.pushed, false)
    assert.equal(r.ahead, 1)
    assert.equal(read(w.box, 'scripts/new.js'), 'a stray copy\n', 'left alone')
    assert.equal(r.warnings[0], 'WARNING: git pull --rebase failed: untracked files the remote now tracks are in the way: scripts/new.js')
    assert.match(r.warnings[1], /^WARNING: git push failed: ! \[rejected\] .*; 1 commit\(s\) here are not on origin$/)
    assert.equal(r.warnings.length, 2)
  } finally {
    w.done()
  }
})

test("an autostash back in conflict on a snapshot keeps the box's copy and leaves nothing unmerged", () => {
  const w = world({ ...BASE, 'content/.markets.json': '{\n  "asOf": "2026-11-01"\n}\n' })
  try {
    commit(w.laptop, 'content: markets', { 'content/.markets.json': '{\n  "asOf": "2026-11-02"\n}\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    // The box's snapshot is a local change, never committed; another one too.
    put(w.box, 'content/.markets.json', '{\n  "asOf": "2026-11-06"\n}\n')
    put(w.box, 'content/articles/a.md', 'one, corrected\n')
    commit(w.box, 'Editorial cycle', { 'content/articles/b.md': 'two\n' })

    const r = sync(w.box)
    assert.deepEqual([r.pulled, r.pushed, r.warnings], [true, true, []])
    assert.equal(read(w.box, 'content/.markets.json'), '{\n  "asOf": "2026-11-06"\n}\n')
    assert.equal(read(w.box, 'content/articles/a.md'), 'one, corrected\n', 'the change that did not conflict is back too')
    assert.equal(git(w.box, 'diff', '--name-only', '--diff-filter=U'), '', 'nothing unmerged')
    assert.equal(git(w.box, 'diff', '--cached', '--name-only'), '', 'nothing staged')
    assert.equal(git(w.box, 'stash', 'list'), '', 'the autostash is spent')
    assert.match(r.said, /autostash came back in conflict with the pull on content\/\.markets\.json/)
  } finally {
    w.done()
  }
})

test("npm's rewrite of the lockfile never meets the owner's in the autostash", () => {
  const w = world(BASE)
  try {
    commit(w.laptop, 'chore(deps)', { 'package-lock.json': '{\n  "a": 2\n}\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    put(w.box, 'package-lock.json', '{\n  "a": 1,\n  "noise": true\n}\n')
    commit(w.box, 'Editorial cycle', { 'content/articles/b.md': 'two\n' })

    const r = sync(w.box)
    assert.deepEqual([r.pulled, r.pushed, r.warnings], [true, true, []])
    assert.equal(read(w.box, 'package-lock.json'), '{\n  "a": 2\n}\n', "the owner's, for the install to read")
    assert.equal(git(w.box, 'stash', 'list'), '')
  } finally {
    w.done()
  }
})

test('a rebase that stops on a conflict is aborted, and the box is as it was', () => {
  const w = world(BASE)
  try {
    commit(w.laptop, 'content: a correction', { 'content/articles/a.md': 'one, as the owner corrected it\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    commit(w.box, 'Editorial cycle', { 'content/articles/a.md': 'one, as the editor corrected it\n' })
    put(w.box, 'content/.gdacs.json', 'local\n')
    const head = git(w.box, 'rev-parse', 'HEAD')

    const r = sync(w.box)
    assert.equal(r.pulled, false)
    assert.equal(git(w.box, 'rev-parse', 'HEAD'), head)
    assert.equal(read(w.box, 'content/articles/a.md'), 'one, as the editor corrected it\n')
    assert.equal(read(w.box, 'content/.gdacs.json'), 'local\n')
    assert.ok(!existsSync(join(w.box, '.git', 'rebase-merge')) && !existsSync(join(w.box, '.git', 'rebase-apply')), 'no rebase left open')
    assert.match(r.warnings[0], /^WARNING: git pull --rebase failed: CONFLICT/)
    assert.match(r.said, /the rebase stopped on a conflict at [0-9a-f]+ and was aborted/)
  } finally {
    w.done()
  }
})

test("a local change to code that conflicts takes the pulled copy and stays in the stash", () => {
  const w = world({ ...BASE, 'scripts/build.js': 'a\nb\n' })
  try {
    commit(w.laptop, 'Build: b2', { 'scripts/build.js': 'a\nb2\n' })
    git(w.laptop, 'push', '-q', 'origin', 'master')
    put(w.box, 'scripts/build.js', 'a\nb on the box\n')

    const r = sync(w.box)
    assert.equal(r.pulled, true)
    assert.equal(read(w.box, 'scripts/build.js'), 'a\nb2\n')
    assert.equal(git(w.box, 'diff', '--name-only', '--diff-filter=U'), '')
    assert.match(git(w.box, 'stash', 'list'), /autostash/)
    assert.match(r.warnings[0], /^WARNING: git pull --rebase failed: a local change to scripts\/build\.js conflicted with the pull/)
  } finally {
    w.done()
  }
})

test('the files git names as in the way, and its reason', () => {
  const out = [
    'From https://github.com/YunusAndreasson/zuhd.news',
    ' * branch              master     -> FETCH_HEAD',
    'Created autostash: 25bf292b',
    'error: The following untracked working tree files would be overwritten by checkout:',
    '\tcontent/.ai-models.json',
    '\tcontent/.companies.json',
    'Please move or remove them before you switch branches.',
    'Aborting',
    'Applied autostash.',
    'error: could not detach HEAD',
  ].join('\n')
  assert.deepEqual(untrackedInTheWay(out), ['content/.ai-models.json', 'content/.companies.json'])
  assert.equal(gitReason(out), 'error: The following untracked working tree files would be overwritten by checkout:')
  assert.equal(gitReason('Rebasing (1/2)\rRebasing (2/2)\r'), 'Rebasing (2/2)')
  assert.equal(gitReason(' ! [rejected]          master -> master (non-fast-forward)\nerror: failed to push some refs'), '! [rejected]          master -> master (non-fast-forward)')
  assert.deepEqual(untrackedInTheWay('Already up to date.'), [])
  assert.equal(cycleOwns('content/.companies.json'), true)
  assert.equal(cycleOwns('scripts/build.js'), false)
})
