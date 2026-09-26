import assert from 'node:assert/strict'
import { test } from 'node:test'
import { XMLParser } from 'fast-xml-parser'
import { htmlLeadImage, rssItemImage } from './feed-image.js'

// Same options as fetch-news.js's shared parser.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, htmlEntities: true })
const item = (inner) => parser.parse(`<rss><channel><item><title>t</title>${inner}</item></channel></rss>`).rss.channel.item

test('media:content image', () => {
  assert.equal(rssItemImage(item('<media:content url="https://x.org/a.jpg" medium="image"/>')), 'https://x.org/a.jpg')
})

test('media:content video is not an image', () => {
  assert.equal(rssItemImage(item('<media:content url="https://x.org/a.mp4" type="video/mp4"/>')), null)
})

test('media:thumbnail', () => {
  assert.equal(rssItemImage(item('<media:thumbnail url="https://x.org/t.png"/>')), 'https://x.org/t.png')
})

test('image enclosure, and an audio enclosure is skipped', () => {
  assert.equal(rssItemImage(item('<enclosure url="https://x.org/e.jpg" type="image/jpeg" length="1"/>')), 'https://x.org/e.jpg')
  assert.equal(rssItemImage(item('<enclosure url="https://x.org/e.mp3" type="audio/mpeg" length="1"/>')), null)
})

test('first <img> in content:encoded', () => {
  const raw = item('<content:encoded><![CDATA[<p>hi</p><img src="https://x.org/i.webp" alt=""/>]]></content:encoded>')
  assert.equal(rssItemImage(raw), 'https://x.org/i.webp')
})

test('nothing, or a relative URL, is null', () => {
  assert.equal(rssItemImage(item('<description>plain</description>')), null)
  assert.equal(rssItemImage(item('<description><![CDATA[<img src="/rel.jpg">]]></description>')), null)
})

test('og:image either attribute order, twitter fallback', () => {
  assert.equal(htmlLeadImage('<meta property="og:image" content="https://a.com/1.jpg">'), 'https://a.com/1.jpg')
  assert.equal(htmlLeadImage('<meta content="https://a.com/2.jpg" property="og:image" />'), 'https://a.com/2.jpg')
  assert.equal(htmlLeadImage('<meta name="twitter:image" content="https://a.com/3.jpg">'), 'https://a.com/3.jpg')
  assert.equal(htmlLeadImage('<title>none</title>'), null)
})
