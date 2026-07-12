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
     Previous: "Global hard news in plain language. No ads, no tracking, no accounts." -->

## Full Description
A news app that barely uses data. Text-first and lightweight — it works on slow and unreliable connections, without the weight of a typical news app.

Global hard news — politics, economy, science, technology — from sources across six continents, updated five times daily. Each article says what happened, why it matters, and what comes next. Then it stops.

Where a story is told from determines who counts as a person and who becomes a number. Every article cites its sources and shows how each one framed the story.

Features:
• Barely uses data — built for slow and costly connections
• Smart Brevity format: lead, context, details, what's next
• Thread timelines for developing stories
• Daily audio briefings
• No ads. No tracking. No accounts. No data collected.

Zuhd — the discipline of doing without what you do not need.

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
