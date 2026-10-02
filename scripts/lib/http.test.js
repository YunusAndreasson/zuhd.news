import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { fetchJson, fetchOk, fetchText, ZUHD_UA } from './http.js'

let server
let base
before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ua') res.end(JSON.stringify({ ua: req.headers['user-agent'] }))
    else if (req.url === '/404') {
      res.statusCode = 404
      res.end('no')
    } else if (req.url === '/stall') {
      // Headers now, body never: the case the hand-rolled timers missed.
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{')
    } else res.end('plain')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  server.closeAllConnections()
  server.close()
})

test('sends our user-agent unless the caller names one', async () => {
  assert.deepEqual(await fetchJson(`${base}/ua`), { ua: ZUHD_UA })
  assert.deepEqual(await fetchJson(`${base}/ua`, { headers: { 'user-agent': 'x' } }), { ua: 'x' })
})

test('a non-2xx status throws with the status in the message', async () => {
  await assert.rejects(fetchOk(`${base}/404`), /HTTP 404/)
})

test('the deadline covers a body that stalls after the headers', async () => {
  const t0 = Date.now()
  await assert.rejects(fetchJson(`${base}/stall`, { timeoutMs: 200 }))
  assert.ok(Date.now() - t0 < 2000)
})

test('fetchText returns the body', async () => {
  assert.equal(await fetchText(`${base}/plain`), 'plain')
})
