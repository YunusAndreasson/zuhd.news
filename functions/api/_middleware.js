// Privacy-clean app-open beacon.
//
// The mobile app fetches its content from `${API_BASE}/api/*.json`
// (API_BASE = https://zuhd-news.pages.dev) on every cold start — see
// mobile/hooks/useArticles.ts + mobile/lib/background-fetch.ts, which hit
// /api/meta.json and /api/feed.json. Those JSONs are STATIC assets, so they
// normally invoke no Function and are invisible to analytics. This middleware
// makes them observable: it logs ONLY the request country + path, then falls
// through to serve the exact same static asset via context.next().
//
// Purpose: watch mobile app-open lift per country in near-real-time (e.g. during
// paid-install campaigns) WITHOUT any in-app SDK/tracking — consistent with the
// "no ads, no tracking, no accounts" stance. No IP, no user-agent, no PII logged.
//
// View live:   npx wrangler pages deployment tail --project-name zuhd-news | grep app_open
// Or the Cloudflare dashboard: Workers & Pages > zuhd-news > Observability / Logs.
//
// Cost note: routes all /api/* through a Function (was static). Volume is tiny;
// logging is gated to *.json so dynamic endpoints (tokens/push) are untouched.
export async function onRequest(context) {
  const { request } = context;
  const { pathname } = new URL(request.url);

  if (pathname.endsWith('.json')) {
    // request.cf.country is Cloudflare's edge geo — coarse, no PII.
    const country = request.cf?.country ?? 'XX';
    console.log(JSON.stringify({ tag: 'app_open', path: pathname, country }));
  }

  return context.next();
}
