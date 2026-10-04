---
paths:
  - "mobile/app/index.tsx"
  - "mobile/components/map/MapSheet.tsx"
  - "mobile/components/map/Story*.tsx"
  - "mobile/components/map/MapHeader.tsx"
  - "mobile/components/ScrubBar.tsx"
  - "mobile/components/Briefing*.tsx"
  - "mobile/components/OddsLine.tsx"
  - "mobile/components/StoryChart.tsx"
  - "mobile/hooks/useScrub.ts"
  - "mobile/hooks/useArticles.ts"
  - "mobile/hooks/useReadTracking.ts"
  - "mobile/lib/deck-*.ts"
  - "mobile/lib/news-order.ts"
  - "mobile/lib/article-utils.ts"
  - "mobile/lib/fetchJson.ts"
  - "mobile/lib/fresh-store.ts"
  - "mobile/lib/read-store.ts"
  - "mobile/lib/time-track.ts"
  - "mobile/lib/scrub-segments.ts"
  - "mobile/lib/coverage.ts"
  - "mobile/lib/arrival.ts"
  - "mobile/lib/api-snapshots.ts"
  - "mobile/lib/resume-landing.ts"
  - "mobile/lib/background-fetch.ts"
  - "mobile/lib/story-card.ts"
  - "mobile/lib/predictions.ts"
  - "mobile/lib/markdown.tsx"
---

# The river, the sheet, the card and the dock

## The river

- The river is the last 24 hours of what zuhd published (`recentRiver`). With
  nothing inside the day it anchors on the newest story. A story asked for by
  name is pinned in (`pinStory`).
- Order is newest published first. Time is `articleTime` (`ranAt`, then
  `publishedAt`; `addedAt`, a file mtime, only on old payloads). Never order
  or date a card by `addedAt` or the event's date yourself.
- Stories from one cycle share a time. Inside that run the most reported comes
  first (`compareHeat`), then the newest event. No whole-river top-stories
  lead: it made the playhead leap across the day.
- New is decided by slug (`lib/fresh-store.ts`), never by a time. A new card's
  kicker ends `· new`, and the first already-known card after them ends
  `· earlier`. The category word always starts at the text's edge. A story read
  once says `new` no more. When every story in the day is new, none is.
- Read is two seconds in front (`READ_DWELL_MS`, `hooks/useReadTracking.ts`).
- `‹ n new` counts unread new stories behind the reader only
  (`unreadNewBehind`). It floats over the track, never in its row.

## Arrivals and refresh

- A new build reaches the screen as one arrival in one commit
  (`lib/arrival.ts`). Every layer the screen needs is in `API_SNAPSHOTS`; the
  feed query never refetches on mount or focus. A resume, a pull, the launch
  check and the background task all go through it.
- Snapshots are fetched with the `ETag` of the copy the app holds
  (`fetchJsonIfChanged`). Send a tag only while the app still holds that
  layer's data, or a 304 leaves it empty.
- A 404 on an optional endpoint, or a malformed optional key such as famine's
  `totals`, reads as none. It must not cost a layer its other data.
- Where a return lands is `lib/resume-landing.ts`: under an hour the reader
  stays put, with a toast if stories arrived; longer, or on a launch the reader
  has not moved in, the deck goes to the front in the arrival's own commit.
  The story in front is anchored by slug.
- Pull to refresh is a pull on the sheet at rest (`MapSheet.onPullDown`).
  Never RN's `RefreshControl` here. A refresh that inserts stories keeps the
  reader on their story.

## The sheet and its gestures

- `MapSheet` has three rules: at peek the card does not scroll, nothing
  bounces, and the pan decides ownership once per gesture and holds it. The
  pan waits for a direction first; its first update can carry
  `translationY === 0`.
- The deck and the sheet never share a drag. The deck claims at 16pt
  horizontal and fails at 12pt vertical; the sheet claims at 8pt vertical and
  fails at 24pt horizontal. Neither is `simultaneousWith` the other.
- Commit the new index when the finger lifts, not in the spring's callback.
- A slot that comes to the front writes scroll offset 0 for the sheet, or the
  next story cannot be pulled down.
- The deck recycles three slots keyed by slot (`lib/deck-slots.ts`), not by
  slug. Only the card in front takes `open`.
- A swipe lands where the card would come to rest (`lib/deck-swipe.ts`), capped
  at one story from the committed story. A swipe is never a tap: the card's
  open targets use `useTapOnly`.
- Android's back puts a grown story down before it leaves the app.
- Opening a story lifts the globe with a view translate (`globeLiftStyle`). A
  touch on the globe above an open story collapses it.

## The card

- At rest: kicker, title and the hook (the first sentence). Peek height is
  computed from type (`lib/deck-layout.ts`), once per window and font scale,
  never per card.
- `article.sentences` holds four blocks or five. Slice with `hookOf`/`restOf`;
  never index it. `STORY_LINES` is keyed to the writer's character ceiling in
  `scripts/write-prompt.md`; change them together.
- Open, the sheet is one height for every story (`layout.full`). Scrolling an
  open story is the norm. No per-story stop.
- Every block is its own paragraph with a gap. Never run blocks together to
  save height. The hook is the lede (`mdStyles.lede`).
- Nothing mounts or reflows when the card grows: the rest is laid out under a
  `Veil`. The veil is on only with the sheet exactly at rest and switches,
  never fades.
- At rest the card is one button. The hook's links are plain words until open.
- Body text carries no `letterSpacing` (Android measures a phantom line).
- The footer is `save · share · sources` (`StoryFooter`): outside the card,
  straight after the text, set to the right, no rule above or below, no count
  on `sources`, with an always-mounted 16pt fade over it. Never pin it to the
  sheet's foot with a hole under short stories.
- Stories use the full reading width. The next card does not peek.
- The end card says `caught up` only when no new story is unread.
- `threadSummary` is never rendered: it is the desk's note to the writer. A
  thread kicker needs `threadArticleCount > 1`.
- Odds are merged into the story they settle (`OddsLine`). The stories a
  contract cites come from the indicator, else from `/api/analysis.json`
  (`lib/predictions.ts`). Print the level, the move in points and
  `MARKET_CAVEAT`. Never plot or tint them. A story with a chart shows the
  chart instead of the odds line.

## The dock and the top bar

- The track is the day: now at the left under the word `now`, each story at
  its publish time (`lib/time-track.ts`), a tick every six hours.
- Where you are is one playhead in emphasis ink riding `fraction` on the UI
  thread. Cell height means reports only (`eventCoverage` ≥ 400). No report
  count is printed; if one returns its unit is `reports`, only over that bar.
- A read story is a 1pt hairline in a quieter step of its hue. Cells are
  placed by time, and the gap between them closes only when a story's pitch
  falls under 3pt; they never merge into one bar. The track has no mark for
  new.
- The kicker has no dot. Its category word carries the colour
  (`categoryText*`).
- `useScrub` and `ScrubBar` are shared with the briefing's scrubber.
- The menu (three lines) is at the top right with `▶` beside it, both through
  `HeaderControl`. `▶` hides while the player is up and keeps its slot. The
  player hangs under the top bar and floats; it is not part of the layout.
