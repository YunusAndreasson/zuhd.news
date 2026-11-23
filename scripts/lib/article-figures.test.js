// The article's locator and its story chart, both drawn at build.
//
// The locator is inline in every article page, so its size is page weight on
// eight hundred pages; the chart restates the map card's figures, so its
// series and its move must be the card's.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { locatorHtml } from '../build/locator.js'
import { storyChartHtml, storyChartId } from '../build/story-chart.js'
import { scratchDir } from './island-bundle.js'

test('an article with no coordinates gets no locator', () => {
  assert.equal(locatorHtml({ lat: null, lng: 56, place: 'Khasab' }), '')
  assert.equal(locatorHtml({ lat: 'x', lng: 56, place: 'Khasab' }), '')
})

test('a locator stays under 8 KB, marks the place in the box, and names it', () => {
  /** @type {Array<[string, number, number]>} */
  const places = [['Khasab', 26.18, 56.25], ['London', 51.5, -0.12], ['Santiago', -33.4, -70.6], ['Suva', -18.1, 178.4]]
  for (const [place, lat, lng] of places) {
    const html = locatorHtml({ lat, lng, place })
    assert.ok(html.length < 8192, `${place}: ${html.length} bytes`)
    const dot = html.match(/article-locator-dot" cx="([\d.]+)" cy="([\d.]+)"/)
    assert.ok(dot, place)
    // The view is centred on the place to the half degree, so the mark is at
    // the middle of the 112-unit box, give or take a unit.
    assert.ok(Math.abs(Number(dot[1]) - 56) < 1.5 && Math.abs(Number(dot[2]) - 56) < 1.5, `${place}: ${dot[1]},${dot[2]}`)
    assert.match(html, new RegExp(`<figcaption class="article-locator-place">${place}</figcaption>`))
  }
})

test('the place’s own country is drawn a step darker, found on the 1:50m outlines', () => {
  // Khasab is on the Musandam peninsula: at 1:110m it falls in the sea.
  assert.match(locatorHtml({ lat: 26.18, lng: 56.25, place: 'Khasab' }), /article-locator-home/)
  assert.doesNotMatch(locatorHtml({ lat: 0, lng: -140, place: 'Pacific' }), /article-locator-home/)
})

test('the chart is the card’s series: the one named, else the first followed with a record', () => {
  const known = new Map([['cp:hormuz', {}], ['brent', {}], ['co:aapl', {}]])
  const id = (x) => x
  assert.equal(storyChartId({ chart: 'brent', entities: [{ indicatorId: 'cp:hormuz' }] }, known, id), 'brent')
  // A company's id has no /api/entity file (`hasSeriesRecord`), so the card
  // falls through to what the story follows.
  assert.equal(storyChartId({ chart: 'co:aapl', entities: [{ indicatorId: 'cp:hormuz' }] }, known, id), 'cp:hormuz')
  assert.equal(storyChartId({ chart: 'nope', entities: [{ indicatorId: 'nope2' }, { indicatorId: 'brent' }] }, known, id), 'brent')
  assert.equal(storyChartId({}, known, id), null)
})

test('the chart prints the line’s own move, in points for a rate', () => {
  const dir = scratchDir('article-figures')
  mkdirSync(join(dir, 'api', 'entity'), { recursive: true })
  const write = (rec) => writeFileSync(join(dir, 'api', 'entity', `${rec.id}.json`), JSON.stringify(rec))
  write({ id: 'lvl', label: 'Level', unit: 'vessels/day', currentFormatted: '2.00 vessels/day', sourceLabel: 'IMF PortWatch', values: [4, 3, 2], periods: ['Jul 1', 'Jul 2', 'Jul 3'] })
  write({ id: 'rate', label: 'Rate', unit: '%', currentFormatted: '4.00%', values: [5.25, 4.5, 4], periods: ['Jan', 'Feb', 'Mar'] })
  const lvl = storyChartHtml('lvl', dir)
  assert.match(lvl, /article-chart is-neg/)
  assert.match(lvl, /article-chart-move">−50\.0%</)
  assert.match(lvl, /<span>Jul 1<\/span><span>Jul 3<\/span>/)
  assert.match(lvl, /article-chart-source">IMF PortWatch</)
  assert.match(storyChartHtml('rate', dir), /article-chart-move">−1\.25 pts</)
  assert.equal(storyChartHtml('missing', dir), '')
})
