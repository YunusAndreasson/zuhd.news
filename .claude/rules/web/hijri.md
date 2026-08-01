---
paths:
  - "public/islands/_map/hijri.ts"
  - "public/islands/_map/format.ts"
  - "public/islands/_map/markets.ts"
  - "scripts/lib/market-metadata.js"
---

# The Hijri calendar, the Makkah clock, and Eid closures

No library and no table of dates — `Intl` has shipped the Islamic calendars
since ES2015. Which variant, which zone, and which holidays are modelled are
all decisions with silent failure modes.

## The Hijri calendar

`public/islands/_map/hijri.ts` — no library and no table of dates. `Intl` has
shipped the Islamic calendars since ES2015, so the whole conversion costs a
`DateTimeFormat` and nothing in the bundle, which is the only reason it earns
its place: a date the reader can get from their own phone does not justify a
dependency.

- **Umm al-Qura specifically.** The four variants `Intl` exposes disagree by up
  to two days on the same instant (`islamic-civil` reads 10 Safar where
  `islamic-umalqura` reads 12), and picking the wrong one produces a date that
  is wrong and entirely plausible — no shape to the error, nothing renders
  oddly, no reader can catch it. It is the civil calendar of Saudi Arabia and
  what the Gulf exchanges schedule against, which is the right instrument for
  both uses here. A test pins the choice. Month names come from our own table,
  because ICU spells Safar "Ṣafar" in some builds and emits the numeral in
  others.
- **In the map's time readout, and nowhere else.** It is the site's one line
  saying what time it is, so it is the only place a second calendar does not
  repeat itself — the article kicker says "3h ago" and the footer date would be
  a third statement. It earns the space by *moving*: the rail spans fourteen
  days, so scrubbing walks half a lunar month.
- **Read in the same frame as the clock beside it** — **Makkah** since
  2026-07-26, previously UTC. Mixing frames on one row puts two different days
  on the same line for most of the world, which is worse than the
  approximation. The frame is `MAKKAH_TZ` in `_map/format.ts` (`Asia/Riyadh`;
  there is no `Asia/Mecca` in the IANA database) and **everything that states a
  time uses it**: the header clock, the scrubber readout, the rail's day
  anchor and tick labels, and this date. Changing only the readout is the
  smaller edit and the wrong one — between 21:00Z and midnight the Makkah date
  is already tomorrow, so for three hours a day the readout would name a day
  the tick under the scrub head contradicted. The offset is resolved through
  `Intl` (`zoneOffset`), not hardcoded as `3 * HOUR_MS`: Saudi Arabia has never
  observed daylight saving, so the two agree today, and only one of them stays
  honest if that ever changes. It is resolved **once per rail** rather than per
  value, which is safe only because there is no DST in this zone. The label is
  "Makkah", not `AST` — that also means Atlantic Standard Time, and the place is
  the point. This pairing is now *correct* rather than merely consistent: Umm
  al-Qura is Saudi Arabia's own civil calendar, so Saudi Arabia's zone is the
  frame it is defined in. `HIJRI_NOTE`, on the element's `title`, states the
  real caveat: the Hijri day turns at **maghrib**, so there are always two
  Hijri dates in the world at once and the boundary between them is the
  terminator this map already draws.
- **Eid is modelled in the markets layer; no other holiday is.** CLAUDE.md used
  to record "Holidays are not modelled — an Eid closure reads as trading" as a
  known defect, and it was the one the layer built to carry the Gulf could least
  afford: five exchanges shut for the better part of a week twice a year and the
  map drew each as a live disc with the previous week's number in it.
  `eidClosure` suppresses `isTrading` and `sessionLabel` names the Eid —
  "closed · Eid al-Fitr" answers the question "last close · Thu" only dodges.
  Christmas, national days and unscheduled halts still read as trading.
- **`holidays: 'islamic'` is an editorial flag on the catalog, not derived from
  `iso2`** — and the trap it avoids is real: TASE runs Sunday–Thursday exactly
  as Tadawul does, so any rule inferring Eid from the trading week closes the
  Tel Aviv exchange for Eid al-Fitr. A test pins the five that carry it and that
  TASE does not. The windows are **wider than the two feast days** (29 Ramadan –
  4 Shawwal, 8–14 Dhu al-Hijja) because Umm al-Qura is calculated and the actual
  Eid is sighted; the two can differ by a day either way.
- **Nisab, on the metals card only** (`nisab` in `_map/markets.ts`). The one
  question a Muslim reader actually has about the gold price, and the whole
  answer is arithmetic on the figure already in the card's hero line — no fetch,
  no payload, no new surface. It **prints the range rather than choosing**
  (85–87.48 g gold, 595–612.36 g silver): the classical thresholds are 20 dinars
  and 200 dirhams, and converting those to grams is where the schools part, so
  picking one would have the site holding a fiqh position it has no business
  holding. Silver is the more consequential figure — the lower threshold, and
  the majority position for zakat on cash — and it is **live as of 2026-07-30**:
  `xag` is now published daily in `$/oz`, `NISAB_WEIGHTS` was already keyed for
  it, and the metals card prints **$1,069 – $1,100** against gold's
  $11,062 – $11,385. This entry used to record it as uncomputable and say
  "landing that series is what turns it on, not a code change" — which turned out
  to be exactly right, and is why nothing needed writing when the series landed.
  Worth keeping as the pattern: a gap recorded with its cause is a gap that
  closes itself.
