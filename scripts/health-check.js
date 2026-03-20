#!/usr/bin/env node
// Health check — alerts if zuhd.news hasn't updated within STALE_HOURS.
// Usage: node scripts/health-check.js
//   Exit 0 = healthy, Exit 1 = stale or unreachable
//   Set STALE_HOURS env to override threshold (default: 6)
//   Set NTFY_TOPIC env to push alerts to ntfy.sh (e.g. NTFY_TOPIC=zuhd-health)

const STALE_HOURS = Number(process.env.STALE_HOURS) || 6
const NTFY_TOPIC = process.env.NTFY_TOPIC || ''
const META_URL = 'https://zuhd.news/api/meta.json'

async function main() {
  let meta
  try {
    const res = await fetch(META_URL, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    meta = await res.json()
  } catch (err) {
    await alert(`zuhd.news unreachable: ${err.message}`)
    process.exit(1)
  }

  const generated = new Date(meta.generated)
  const ageMs = Date.now() - generated.getTime()
  const ageHours = ageMs / (60 * 60 * 1000)

  if (ageHours > STALE_HOURS) {
    await alert(`zuhd.news is stale: last updated ${ageHours.toFixed(1)}h ago (threshold: ${STALE_HOURS}h)`)
    process.exit(1)
  }

  console.log(`OK — last updated ${ageHours.toFixed(1)}h ago (${meta.total} articles)`)
}

async function alert(message) {
  console.error(message)
  if (NTFY_TOPIC) {
    try {
      await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
        method: 'POST',
        headers: { Title: 'zuhd.news health', Priority: '4', Tags: 'newspaper' },
        body: message,
        signal: AbortSignal.timeout(5000),
      })
    } catch { /* alert delivery is best-effort */ }
  }
}

main()
