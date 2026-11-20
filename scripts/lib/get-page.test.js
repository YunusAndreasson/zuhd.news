import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { ROOT } from './paths.js'

const SCRIPT = readFileSync(join(ROOT, 'public', 'get.js'), 'utf8')
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9)'

/** Run /get's script as a phone would, and return where it sends the phone. */
function storeFor(query, userAgent) {
  let target = null
  runInNewContext(SCRIPT, {
    URLSearchParams,
    encodeURIComponent,
    location: { search: query, replace: (url) => { target = url } },
    navigator: { userAgent },
    document: { addEventListener: () => {} },
  })
  return target
}

const referrerOf = (url) => new URL(url).searchParams.get('referrer')

test('a bio link’s tags reach Play’s referrer, and nothing else in the query does', () => {
  const url = storeFor('?utm_source=x&utm_medium=social&utm_campaign=x-bio&fbclid=abc', ANDROID)
  assert.equal(referrerOf(url), 'utm_source=x&utm_medium=social&utm_campaign=x-bio')
})

test('our tags win over the ones Instagram appends to a bio link', () => {
  const query = '?utm_source=instagram&utm_medium=social&utm_campaign=instagram-bio&utm_source=ig&utm_content=link_in_bio'
  const tags = new URLSearchParams(referrerOf(storeFor(query, ANDROID)))
  assert.equal(tags.get('utm_source'), 'instagram')
  assert.equal(tags.get('utm_campaign'), 'instagram-bio')
})

test('a visit with no tags goes to the store untagged, never credited to an ad', () => {
  assert.equal(storeFor('', ANDROID), 'https://play.google.com/store/apps/details?id=news.zuhd.app')
  assert.equal(storeFor('', IPHONE), 'https://apps.apple.com/app/id6760964753')
})

test('the App Store link stays plain until the provider token is set', () => {
  assert.equal(storeFor('?utm_source=x&utm_campaign=x-bio', IPHONE), 'https://apps.apple.com/app/id6760964753')
})

test('with the provider token, the App Store gets the campaign as ct', () => {
  const withToken = SCRIPT.replace("const APPLE_PROVIDER_TOKEN = ''", "const APPLE_PROVIDER_TOKEN = '123456'")
  assert.notEqual(withToken, SCRIPT)
  let target = null
  runInNewContext(withToken, {
    URLSearchParams,
    encodeURIComponent,
    location: { search: '?utm_source=x&utm_campaign=x-bio', replace: (url) => { target = url } },
    navigator: { userAgent: IPHONE },
    document: { addEventListener: () => {} },
  })
  const url = new URL(target)
  assert.equal(url.searchParams.get('pt'), '123456')
  assert.equal(url.searchParams.get('ct'), 'x-bio')
  assert.equal(url.searchParams.get('mt'), '8')
})
