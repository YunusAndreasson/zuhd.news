---
paths:
  - "public/islands/_map/hijri.ts"
  - "public/islands/_map/format.ts"
  - "public/islands/_map/markets.ts"
  - "scripts/lib/market-metadata.js"
---

# The Hijri calendar, the Makkah clock, Eid closures and nisab

`Intl` has the Islamic calendars, so `_map/hijri.ts` needs no library and no
table of dates. Which variant, which zone and which holidays are modelled are
decisions, and each fails silently.

- The calendar is `islamic-umalqura`: Saudi Arabia's civil calendar, and what
  the Gulf exchanges schedule against. The variants disagree by up to two days
  and a wrong one looks plausible; a test pins the choice. Month names come
  from our own table, because ICU's spelling varies by build.
- The Hijri date prints beside each Makkah clock (the rail head when wide, the
  scrubber readout otherwise) and nowhere else.
- Every time and date on the map is read in Makkah's frame (the prayer-line
  hover, in local solar time, is the one exception): `MAKKAH_TZ`
  (`Asia/Riyadh`) in `_map/format.ts`, through `zoneOffset`, never a hardcoded
  three hours. Change one readout alone and for three hours a day it names a
  different day from the tick under it. The label is `Makkah`, not `AST`.
- `HIJRI_NOTE`, on the element's `title`, states the caveat: the Hijri day
  turns at maghrib.
- Eid is the only holiday the markets layer models. `eidClosure` suppresses
  `isTrading`, and `sessionLabel` names the Eid. Christmas, national days and
  unscheduled halts still read as trading.
- `holidays: 'islamic'` is an editorial flag in `scripts/lib/market-metadata.js`,
  never derived from `iso2` or the trading week: TASE runs Sunday to Thursday
  exactly as Tadawul does. A test pins the five exchanges that carry it.
- The Eid windows are wider than the feast days (29 Ramadan to 4 Shawwal, 8 to
  14 Dhu al-Hijja), because Umm al-Qura is calculated and Eid is sighted.
- Nisab (`nisab`, `NISAB_WEIGHTS` in `_map/markets.ts`) is on the metals card
  only and prints the range (85–87.48 g gold, 595–612.36 g silver), never one
  figure. Converting dinars and dirhams to grams is where the schools part,
  and the site holds no fiqh position.
