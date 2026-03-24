# Context Brief Examples (generated from Wikipedia extracts + Tarteel validation)

These are test outputs showing the three format types. All facts sourced from Wikipedia summary API. Quranic verses validated against Tarteel MCP (Ibn Kathir tafsir).

---

## Example 1: Conflict — Iran-US-Israel War (chronological)

```
CONTEXT: Iran–US–Israel

ORIGINS
1953  CIA and MI6 overthrow Iran's elected PM Mosaddegh to protect British oil interests. Shah installed.
1979  Islamic Revolution ends the Shah's US-backed regime. Iran hostage crisis severs ties.

ESCALATION
1985  Iran–Israel proxy conflict begins. Iran backs Hezbollah and Hamas; Israel assassinates Iranian scientists and strikes Iranian forces in Syria.
2024  Proxy war escalates to direct confrontation between Iran and Israel.
2025  Twelve-day war between Iran and Israel, with US military involvement.

NOW
2026  US-Israeli air campaign enters fourth week. Gulf states weigh military entry. IRGC blockades Strait of Hormuz — 20% of global oil flows through its 21-mile chokepoint.

―
وَٱقْتُلُوهُمْ حَيْثُ ثَقِفْتُمُوهُمْ وَأَخْرِجُوهُم مِّنْ حَيْثُ أَخْرَجُوكُمْ ۚ وَٱلْفِتْنَةُ أَشَدُّ مِنَ ٱلْقَتْلِ
"...and fitnah is worse than killing." — Quran 2:191
Ibn Kathir: Fitnah here means persecution and expulsion of people from their homes — a graver sin than combat itself.
```

**Notes:** Chronological fits naturally. The 1953 coup and 1979 revolution are both in Wikipedia and are essential context that Western coverage routinely skips. The Quranic verse (2:191) validated against Ibn Kathir — "fitnah" in this context means persecution/displacement, not "tribulation" in the generic sense. Strong fit for a war involving mass displacement.

---

## Example 2: Person — Sergey Lavrov (thematic)

```
CONTEXT: Sergey Lavrov

ROLE
Russia's foreign minister since 2004. Longest-serving since Andrei Gromyko in the Soviet era.

POSITION
Frames the Ukraine war as NATO provocation. Advocates a multipolar world order to counter Western dominance. Key diplomatic face of Russia's partnerships with BRICS, Gulf, and African states.

WHY IT MATTERS
Hungary's foreign minister admitted consulting Lavrov before and after key EU votes — suggesting Russian influence inside the bloc's decision-making, not just at its borders.
```

**Notes:** No Quranic verse — this is European diplomacy with no natural Muslim angle. The prompt correctly doesn't force one. Thematic structure works: ROLE / POSITION / WHY IT MATTERS. No years needed except "since 2004" inline.

---

## Example 3: Place — Strait of Hormuz (hybrid)

```
CONTEXT: Strait of Hormuz

WHAT IT IS
A 21-mile chokepoint between Iran and Oman connecting the Persian Gulf to the Gulf of Oman. Roughly 20% of the world's oil passes through daily.

WHY IT MATTERS
Iran has threatened closure in every major confrontation since the 1980s. A blockade would spike global energy prices within hours — as the current war is demonstrating across Gulf economies from Sindh to the Philippines.

HISTORY
1988  US and Iran clash in Operation Praying Mantis after Iranian mines damage a US frigate.
2019  Iran seizes British-flagged tanker. Tanker wars resume in the strait.
2026  IRGC turns back a container ship. Gulf states declare highest air defense alert.
```

**Notes:** Hybrid format — thematic top sections, chronological history at the bottom. No Quranic verse; this is geography and energy economics. The Wikipedia extract gave us the physical dimensions and location; the conflict history came from the Iran-US relations extract.

---

## Example 4: Diplomatic rupture — Lebanon-Iran (chronological with Muslim perspective)

```
CONTEXT: Lebanon–Iran

ORIGINS
1982  Israel invades Lebanon, occupies the south for 18 years. Hezbollah founded as Shia resistance with Iranian backing and IRGC training.
1985  Iran–Israel proxy conflict formalises. Lebanon becomes the primary theatre.

RESISTANCE
2000  Hezbollah forces Israeli withdrawal from southern Lebanon after 18 years of occupation.
2006  Thirty-four-day war. Israel's third invasion since 1978. UN ceasefire under Resolution 1701.

FRACTURE
2026  Lebanon declares Iran's ambassador persona non grata. PM publicly accuses IRGC of controlling Hezbollah operations. Decades-long state-within-a-state arrangement breaks under Israeli military pressure and Iranian overreach.

―
يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ كُونُوا۟ قَوَّٰمِينَ بِٱلْقِسْطِ
"O you who have believed, be persistently standing firm in justice, witnesses for Allah, even if it be against yourselves..." — Quran 4:135
Ibn Kathir: Justice requires truthful testimony even when it is costly — against oneself, one's parents, or one's allies.
```

**Notes:** The Muslim perspective is natural here — Hezbollah is a Shia Islamist movement, the IRGC is an Islamic revolutionary institution, and the rupture is between Muslim-majority states. "Resistance" as a section heading names the 2000 withdrawal as the affected community understands it. The verse (4:135) validated via Ibn Kathir — justice even against your own allies. Fits the rupture: Lebanon turning against its longstanding Iranian partner.

---

## Observations

1. **Wikipedia summaries are thin.** The `/page/summary` endpoint gives 1-3 sentences per concept. For historical depth, we likely need the `/page/summary` of *relationship* articles (e.g., "Iran-United_States_relations", "Israeli_occupation_of_southern_Lebanon") rather than just the entity pages. The concept URIs point to entities — we should also fetch the relationship/event pages.

2. **Concept URIs alone aren't enough for history.** "Iran" + "Israel" gives us geographic summaries. "Iran–Israel_proxy_conflict" gives us the actual timeline. Opus should be instructed to derive 2-3 relationship/event Wikipedia titles from the concept list and fetch those too.

3. **The Quranic anchoring worked cleanly in 2 of 4 cases.** Iran war (2:191 on fitnah/persecution) and Lebanon rupture (4:135 on justice against allies) both validated strongly against Ibn Kathir. Lavrov and Hormuz correctly got no verse. The "don't force it" instruction works.

4. **Thematic format is essential.** Lavrov as a timeline would be absurd. The three-heading thematic brief is exactly right for people, institutions, and concepts.

5. **The "NOW" / "WHY IT MATTERS" section bridges context to today's headline.** This is the payoff — the reader scans history, then the last entry connects it to the article they're reading.
