# Store Listing — zuhd.news

Use this for both App Store Connect and Google Play Console.

## App Name
zuhd.news

## Subtitle (App Store, 30 chars)
Global news without the noise

## Short Description (Play Store, 80 chars)
Global hard news that barely uses data. Works on slow connections.

<!-- Message-match with the winning Meta creative (2026-07 "data" concept: CTR 10.7%
     vs 1.3% for the identity angle; Meta funnelled ~65% of spend to India). The paid
     audience responds to the low-data / lightweight utility hook, not privacy alone.
     NOTE: keep price/promotion claims ("no ads, no tracking") OUT of the short
     description — Play rejects them as promotional keywords. They live in the full
     description as features instead.
     Previous: "Global hard news in plain language. No ads, no tracking, no accounts."

     Untested variant, now that the claim has a number behind it (the feed
     dropped from ~180 KB to ~15 KB gzipped on 2026-07-25). Worth an A/B
     against the line above rather than a straight swap — the current one is
     message-matched to a creative that won 10.7% vs 1.3%:
       "Global hard news for about 15 KB a day. Works on slow connections."
     (66 chars. Factual capability, not a price claim, so it should clear the
     promotional-keyword filter that rejected "no ads, no tracking".) -->

## Full Description
A day's news costs about 15 KB. Text-first and lightweight — it works on slow and unreliable connections, without the weight of a typical news app.

Global hard news — politics, economy, science, technology — from sources across six continents, updated five times daily. Each article says what happened, why it matters, and what comes next. Then it stops.

Where a story is told from determines who counts as a person and who becomes a number. Every article cites its sources, shows how each one framed the story, and links to the original reporting.

There is no account to make and no profile to build. The app sends no identifier when it fetches the news, so we have no way to tell readers apart.

Features:
• About 15 KB a day — built for slow and costly connections
• Smart Brevity format: lead, context, details, what's next
• Every article links out to the sources it was written from
• Daily audio briefings, downloaded only when you press listen
• One server, no third parties — no analytics, ad networks, or SDKs
• Nothing stored is connected to you — no account, no profile
• No ads. No tracking. No sign-up.

Settings shows exactly how much data the app has used since you opened it, and lets you erase everything it has stored.

Zuhd — the discipline of doing without what you do not need.

<!-- Claim discipline: every line above is checkable against the app.
     - "about 15 KB a day" — /api/feed-lite.json, gzipped, one editorial cycle.
     - "one server" — the app contacts zuhd-news.pages.dev and nothing else
       automatically; the attribution links on the About page open in the
       browser only when tapped.
     - "no tracking" — no SDKs, no analytics, no beacon (the Pages middleware
       that logged country+path per app-open was removed 2026-07-25).
     Do NOT restore "No data collected" as an absolute: turning notifications
     on stores an anonymous push token server-side (90-day TTL, broadcast to
     all, nothing attached). That's disclosed on the in-app privacy page and
     must be declared truthfully in Play Data Safety / Apple's privacy label —
     see the checklist below. A description claiming "No data collected" while
     the Data Safety form declares an identifier is a direct contradiction, on
     the one feature we most want people to opt into.

     "We have no way to tell readers apart" is not a hedge against that — it
     is the stronger line. "No data collected" is a promise, and every app
     makes it. This is a statement about capability: no accounts, no
     identifier sent with content requests, and push delivered as one
     broadcast to every token (functions/api/push.js lists the whole prefix
     and sends all of them the same payload). It is also exactly what Apple's
     "not linked to you" flag and Play's "not shared" answer mean, so the
     copy and the declarations say one thing. Keep them saying it. -->

## Store privacy declarations

Keep these in sync with `mobile/components/MenuSheet.tsx` → INFO_PAGES.privacy.

### Apple — App Privacy
- Tracking: **No**. The app does not track; `app.json` declares
  `ios.privacyManifests.NSPrivacyTracking: false` with no tracking domains.
- Data collected: **Identifiers → Device ID**, linked to the user: **No**,
  used for tracking: **No**, purpose: **App Functionality**. This is the push
  token, and only when the reader enables notifications. Everything else is
  "Data Not Collected".

### Google Play — Data Safety
- Data collected: the push token, under **App activity / Other**, or
  **Device or other IDs**, depending on how the form is worded that year.
  Collected: yes. Shared: no. Optional (user can turn it off): yes.
  Purpose: App functionality (push delivery).
- Encrypted in transit: yes. User can request deletion: yes — switching
  notifications off deletes the token, and the privacy page's erase control
  clears everything held on the device.
- Everything else: not collected.

## Keywords (App Store, 100 chars)
news,world,global,politics,economy,science,tech,briefing,minimal,privacy

## Category
News (primary)

## Content Rating
Everyone / 4+

## Privacy Policy URL
https://zuhd.news/privacy

## Screenshots Needed
- iPhone 6.7" (1290×2796) — iPhone 15 Pro Max
- iPhone 6.5" (1284×2778) — iPhone 14 Plus
- Android phone (1080×1920 min)

Take on device or use Expo Orbit / simulator:
  1. Article list (politics tab)
  2. Article detail with body text visible
  3. Category bar showing tabs
  4. "Up to date" caught-up screen

## Setup Checklist

### App Store Connect
- [ ] Create App ID at developer.apple.com (bundle: news.zuhd.app)
- [ ] Create app in App Store Connect
- [ ] Note the Apple Team ID → add to eas.json submit.production.ios.appleTeamId
- [ ] Note the ASC App ID (numeric) → add to eas.json submit.production.ios.ascAppId
- [ ] Generate app-specific password at appleid.apple.com
- [ ] Add to GitHub secrets: EXPO_APPLE_APP_SPECIFIC_PASSWORD

### Google Play Console
- [ ] Create app (package: news.zuhd.app)
- [ ] Create service account with "Service Account User" role
- [ ] Download JSON key → add to GitHub secrets: GOOGLE_SERVICE_ACCOUNT_KEY
- [ ] Create an Internal Testing track (first build must be uploaded manually or via EAS)

### GitHub Secrets
- [ ] EXPO_TOKEN — from expo.dev/accounts/edenmind/settings/access-tokens
- [ ] EXPO_APPLE_APP_SPECIFIC_PASSWORD
- [ ] GOOGLE_SERVICE_ACCOUNT_KEY (full JSON content)
