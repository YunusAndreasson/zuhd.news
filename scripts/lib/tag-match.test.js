// A catalog's `topicTags` against a story: one matcher, and what it will not match.
//
// Run: node --test scripts/lib/tag-match.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { CHOKEPOINT_BY_ID } from './chokepoint-metadata.js'
import { matchesAnyTag, tagMatcher } from './entity-registry.js'
import { ROOT } from './paths.js'

test('a tag is matched whole, never inside a word', () => {
  // Each of these was a story under a strait on 2026-10-09, when the build
  // tested a chokepoint's tags with `includes`: 32 of the 54 stories Taiwan's
  // tags matched were `pla` inside another word, and Hormuz had `oil` three ways.
  const taiwan = CHOKEPOINT_BY_ID.taiwan.topicTags
  for (const hay of ['f-47 testing plan takes shape', 'russia denies plague measures', 'darfur hunger fears grow internally displaced person']) {
    assert.equal(matchesAnyTag(taiwan, hay), false, hay)
  }
  const hormuz = CHOKEPOINT_BY_ID.hormuz.topicTags
  for (const hay of ['kushner partners eye lukoil', 'peru grows despite turmoil', "soil's smell reveals health"]) {
    assert.equal(matchesAnyTag(hormuz, hay), false, hay)
  }

  assert.equal(matchesAnyTag(taiwan, 'pla drills ring the island'), true)
  assert.equal(matchesAnyTag(hormuz, 'oil: brent passes $90'), true, 'punctuation is a boundary')
  assert.equal(matchesAnyTag(CHOKEPOINT_BY_ID.suez.topicTags, 'ships return to the red sea'), true, 'a phrase is one tag')
  assert.equal(matchesAnyTag(['Red Sea'], 'ships return to the red sea'), true, 'the tag is lowercased, the story already is')
  assert.equal(matchesAnyTag([], 'anything'), false)
  assert.equal(matchesAnyTag(undefined, 'anything'), false)
})

test('whole means whole: not a plural, not an adjective', () => {
  // What `includes` gave for free and this does not. It is the rule the exchange
  // join and the narration stage already follow, and it cuts both ways: "Tankers
  // Hit in Hormuz" no longer hangs off Malacca by `tanker`, and no longer could.
  assert.equal(tagMatcher('tanker').test('tankers hit in hormuz'), false)
  assert.equal(tagMatcher('egypt').test('rome convicts egyptian officers'), false)
  assert.equal(tagMatcher('c++').test('a c++ compiler'), true, 'a tag is text, not a pattern')
})

// The build's exchange join and the company list each had the pattern written
// out again, and the chokepoint join, sixty lines above the comment explaining
// why a bare `includes` is wrong, still used one. The registry says three call
// sites want its matcher; this is what keeps them on it.
test('the build and the company list match tags with the registry, not a copy', () => {
  const read = (file) => readFileSync(join(ROOT, file), 'utf8')
  for (const file of ['scripts/build.js', 'scripts/lib/companies.js']) {
    assert.equal(read(file).includes('(^|[^a-z0-9])'), false, `${file} spells the boundary pattern itself`)
  }
  assert.doesNotMatch(read('scripts/build.js'), /tags\.some\(\(t\) => hay\.includes\(t\)\)/, 'a tag tested with includes')
})
