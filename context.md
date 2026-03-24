# Context Feature — Background Briefs for Story Threads

## Idea

Every major story thread (Israel-Lebanon, Iran-US, Sudan civil war) gets a context brief generated once and reused across all articles in that thread. The reader taps "context" and sees the background that makes today's news make sense — a chronological timeline for a conflict, a thematic profile for a key actor, or a hybrid for a strategic chokepoint.

## Why

The reader is a Muslim in tech who sees connections between power, history, and current events. "Israel declares South Lebanon zone" means nothing without knowing 1978, 2000, 2006. Most news apps assume the reader already knows — or worse, assume they don't need to.

## Architecture

### Data flow

1. **New thread appears** in story ledger (arc: "breaking", no `context` field)
2. **Fetch Wikipedia summaries** — two layers:
   - **Entity pages** from concept URIs (e.g., `Iran`, `Hezbollah`, `Strait_of_Hormuz`)
     - The raw API returns full concept objects: `{ uri: "http://en.wikipedia.org/wiki/Hezbollah", type: "org", score: 5, label: { eng: "Hezbollah" } }`
     - Currently `extractConcepts()` in `fetch-news-api.js:371-387` discards the URI — **fix: preserve `uri`**
     - Entity summaries give geographic/institutional basics but are **thin on history**
   - **Relationship/event pages** derived by Opus from the concept list (e.g., `Iran–Israel_proxy_conflict`, `Israeli_occupation_of_southern_Lebanon`, `1953_Iranian_coup_d'état`, `Sykes–Picot_Agreement`)
     - These carry the actual historical depth needed for context briefs
     - Opus proposes 2-3 Wikipedia titles based on the entity concepts → fetch those summaries too
     - This is where the Nakba, the coups, the occupations, and the colonial agreements live
   - Wikipedia REST API: `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` — the `extract` field returns a 1-3 sentence summary
3. **Opus generates context brief** from all Wikipedia extracts — be generous with tokens here, quality matters more than cost
   - Grounded: "Every date and fact must come from the provided Wikipedia extracts"
   - Perspective: see "Muslim perspective" section below
   - Format: see "Context format" section below — chronological, thematic, or hybrid depending on subject
   - Don't compress to fit a token budget — if a conflict needs 15 entries to tell the story properly, use 15 entries
4. **Quranic anchoring** (optional) — see section below
5. **Context brief stored** in story ledger alongside the thread (field: `context`)
6. **Build-time linkage:** `build.js` matches each article slug against the ledger's `articles[]` arrays to find its thread. No `threadId` in frontmatter needed — the ledger is the source of truth. Articles without a thread get no context block.
7. **Displayed** in mobile bottom sheet + web collapsible section

### Generation thresholds

Not every thread gets a context brief. Generating one for a one-off earthquake or a single tech story is wasted work.

**Generate context when ALL of these are true:**
- Thread has **3+ articles** (enough signal that the story has legs)
- Thread category is **politics or economy** (science/tech threads skip unless they cross into geopolitics, e.g., "supply chain worm targets Iran")
- Thread arc is **ongoing or developing** (not `fading` — don't invest in dying threads)

**Based on 2026-03-24 data:** 26 of 156 articles (17%) would show a context brief — the iran-war (16), lebanon-iran (3), europe-stagflation (4), pakistan-diplomacy (3) threads. These are exactly the articles where readers need it most. The other 83% are self-contained one-offs that would feel cluttered.

### Generation step

New step in `run-cycle.sh` after the selector updates the ledger. This runs **every cycle**, not just when new threads appear — it continuously evaluates what context is missing.

**The prompt should instruct Opus:**

> Review all threads in the story ledger that meet the generation thresholds. For each, assess:
>
> 1. **Missing context:** Thread has no `context` field at all → generate one.
> 2. **Stale context:** Thread has evolved significantly since the context was written (e.g., a war that started as airstrikes now involves ground troops, or a diplomatic thread where a new actor has entered). If the current brief no longer covers what readers need to understand today's articles, **regenerate it**.
> 3. **Missing sub-context:** A thread may spawn concepts that deserve their own brief. The iran-us-israel-war thread covers the war, but does the reader also need a standalone brief on the Strait of Hormuz, or on the IRGC, or on Sykes-Picot? If a concept appears in 3+ articles and the existing thread brief doesn't cover it deeply enough, propose a new standalone context brief for that concept.
>
> Prioritize: missing > stale > sub-context. Generate up to 3 briefs per cycle.

**Per-cycle flow:**
1. Scan ledger for qualifying threads without `context`, or with `contextGeneratedAt` older than 7 days on fast-moving threads
2. For each:
   a. Fetch entity Wikipedia summaries from concept URIs (automated)
   b. Opus reads the entity summaries and proposes 2-5 relationship/event Wikipedia titles that would add historical depth (e.g., "Iran" + "Israel" → proposes "Iran–Israel_proxy_conflict", "1953_Iranian_coup_d'état", "Sykes–Picot_Agreement")
   c. Fetch those additional summaries — be generous, more extracts = better context
   d. Opus generates the context brief from all extracts combined
   e. Save to ledger with `contextGeneratedAt` timestamp
3. Two-round Wikipedia fetch adds ~1s latency but dramatically improves historical coverage

### Avoiding hallucinations

- Wikipedia provides the facts (dates, events, names, numbers)
- Opus provides the framing and selection (what matters to this reader)
- Prompt: "Every date and fact must come from the provided Wikipedia extracts. If a fact isn't in the extracts, don't include it."
- The Nakba, Sabra and Shatila, Sykes-Picot — these ARE in Wikipedia, they're just rarely surfaced

### The Muslim perspective (when natural, never forced)

The reader is a Muslim who sees history through the lens of ummah, justice, and the long arc of colonialism in Muslim lands. The prompt should tell Opus:

> Frame this timeline from the perspective of a Muslim reader where the history naturally involves Muslim peoples, lands, or institutions. This means:
>
> - Include events that shaped the Muslim world but are routinely omitted from Western summaries: the Nakba, colonial mandates, the fall of the Ottoman caliphate, Sykes-Picot, Sabra and Shatila
> - Name events as affected communities name them — "Nakba" not "Arab exodus", "occupation" not "administration"
> - Frame resistance as resistance, occupation as occupation
> - Include Islamic historical context where it shaped the present (e.g., the caliphate's dissolution redrew the Middle East; the Balfour Declaration was issued during the British Mandate over Muslim Palestine)
>
> **But:** Not every timeline has a Muslim angle. A European stagflation crisis, a US semiconductor shift, or a Latin American trade deal should be written neutrally without forcing an Islamic lens. The perspective emerges from the history, not from editorial insertion. If the thread doesn't naturally involve Muslim peoples or lands, write a straight factual timeline.
>
> This is not propaganda. Every fact must still come from the Wikipedia extracts. The perspective is in *which* facts you select and *how* you name them — not in adding claims that aren't sourced.

### Quranic anchoring (optional, validated via Tarteel MCP)

Some context briefs have a natural connection to Quranic principles — oppression, justice, patience, stewardship. When the connection is genuine, the brief includes a single verse reference at the end.

**How it works:**

1. The generation prompt instructs Opus: "If a Quranic principle genuinely illuminates this history, include one verse reference at the end of the context brief. Do not force it — most briefs will not have one."
2. When Opus proposes a verse, it calls Tarteel MCP `ayah_translation` to get the exact Saheeh International translation (clean, single-verse, directly displayable).
3. Then calls `ayah_tafsir` with `en-tafsir-ibn-kathir` to get the full scholarly commentary. **Important:** tafsir returns thematic verse groups, not single verses (e.g., 2:191 returns 2:190-193). This is actually useful — Opus gets the full context to judge whether the verse applies.
4. Opus reads the tafsir (3,000-8,500 chars) and writes a **one-line summary** of the relevant portion. The raw tafsir is too long to display — the LLM must condense it.
5. If the tafsir doesn't support the intended connection, drop the verse silently.

**What gets displayed:**
- Arabic text (from translation response `text_arabic` field)
- English translation (from Saheeh International, the default translator)
- One-line tafsir note written by Opus, citing the source (e.g., "Ibn Kathir: ...")
- NOT the raw tafsir text — it's scholarly commentary meant for validation, not display

**Tarteel MCP setup:**

```bash
claude mcp add --transport http tarteel-mcp https://mcp.tarteel.ai/mcp
```

Key tools: `ayah_translation` (clean single-verse text + Arabic), `ayah_tafsir` (full scholarly commentary for validation), `list_tafsirs` (available sources). Free, no auth, 104 tafsir sources across 30+ languages. Response format is SSE — parse past `event: message` / `data:` framing to get JSON-RPC payload.

**Available English tafsirs:** `en-tafsir-ibn-kathir` (primary), `en-tafsir-maarif-quran`, `en-tafsir-mokhtasar` (concise, good fallback), `en-tafsir-tazkirul-quran`.

**Constraints:**

- **Validation only** — Opus proposes from its training knowledge, Tarteel confirms via tafsir. The MCP is a fact-check, not a search engine.
- **One verse max per brief** — this is context, not a sermon.
- **Optional, not mandatory** — if the connection isn't obvious, skip it. Semiconductor export controls don't need a verse.
- **No sectarian editorializing** — use widely accepted tafsir (Ibn Kathir, al-Qurtubi) and stick to verses with clear, uncontroversial application to the theme.
- **Opus writes the tafsir summary, not copies it** — raw Ibn Kathir for a single verse is 1,400+ words. The displayed note must be one sentence.

**Examples of natural fits (tested against Tarteel):**

- Israel-Palestine / oppression → 2:191 — "fitnah is worse than killing." Ibn Kathir confirms: refers to persecution and expulsion from homes as graver than combat. ✓ Strong fit.
- Self-determination → 13:11 — "God does not change a people until they change themselves." Ibn Kathir confirms: about collective agency and self-reform. ✓ Strong fit.
- Injustice → 4:135 — "Stand firmly for justice, even against yourselves." Ibn Kathir confirms: testimony must be truthful even when costly. ✓ Strong fit.

**Examples where it should NOT fire:**

- Tech antitrust rulings
- Central bank interest rate decisions
- Space exploration milestones

## What we're working with

### Article format

Articles are single-paragraph Smart Brevity: YAML frontmatter + one body paragraph (~3-4 sentences). Frontmatter includes `title`, `date`, `category`, `location`, `lat/lng`, `sources[]`, `eventCoverage`, `concepts[]`.

```yaml
# Current (labels only — URIs discarded)
concepts:
  - "Saudi Arabia"
  - "United Arab Emirates"
  - "Iran"
  - "Strait of Hormuz"
  - "Gulf Cooperation Council"

# After fix (preserve URIs from Event Registry API)
concepts:
  - label: "Saudi Arabia"
    uri: "http://en.wikipedia.org/wiki/Saudi_Arabia"
  - label: "Strait of Hormuz"
    uri: "http://en.wikipedia.org/wiki/Strait_of_Hormuz"
```

Concepts are currently stored as plain text labels, but the raw Event Registry API returns full objects with Wikipedia URIs, types (person/loc/org), and relevance scores. The URI is discarded by `extractConcepts()` — preserving it is a one-line fix in `fetch-news-api.js`.

### Thread coverage

The story ledger tracks threads with article slug arrays. On 2026-03-24: 49 of 156 articles (31%) belong to a thread. After applying generation thresholds (3+ articles, politics/economy, ongoing/developing), 26 articles (17%) would show a context brief. These are the war, diplomacy, and crisis stories where readers need history most. The other 83% are self-contained one-offs.

### Wikipedia concept quality by thread (sampled)

| Thread | Concepts | Wikipedia hits | Usable for context? |
|--------|----------|---------------|---------------------|
| iran-us-israel-war | Saudi Arabia, UAE, Iran, Strait of Hormuz, GCC | 5/5 (all have wiki URIs) | Yes — rich history |
| russia-ukraine | Ukraine, Russia, Drone warfare, Ukrainian Air Force, Shahed drone | 5/5 | Yes |
| lebanon-iran | Lebanon, Israel, Hezbollah, IDF, Litani River, Iran | 6/6 | Yes — deep history |
| arm-chips | Arm (company), Data center, AI, Semiconductor | 4/4 | No — no historical thread |

### Build-time linkage

Articles don't carry a `threadId` in frontmatter. Instead, `build.js` looks up each article's slug in the ledger's thread `articles[]` arrays at build time. If the thread has a `context` field, inject it into the HTML. This avoids adding fields to the writer prompt or modifying existing articles.

## Context format

Not necessarily a timeline. The format adapts to the subject — chronological for conflicts, thematic for people/places/institutions. The constant is **small-caps headings + one-sentence entries** for scannability.

The prompt should tell Opus:

> Structure the context with 3-5 small-caps section headings. Each entry is one sentence. Use the structure that best fits the subject:
>
> - **Chronological** for conflicts, treaties, crises (year + sentence)
> - **Thematic** for people, places, institutions (heading + sentence, no year needed)
> - **Hybrid** when both apply
>
> The reader should be able to scan the whole thing in 10 seconds.

### Example: conflict (chronological)

```
CONTEXT: Israel–Lebanon

ORIGINS
1917  Balfour Declaration promises Palestine to Zionist movement.
1948  Nakba: 750,000 Palestinians expelled. Israel established.

ESCALATION
1978  Israel invades southern Lebanon (Operation Litani).
1982  Full invasion. Sabra and Shatila massacre kills 2,000+.

RESISTANCE
2000  Hezbollah forces Israeli withdrawal after 22 years.
2006  34-day war. 1,200 Lebanese killed. UN Resolution 1701.

NOW
2026  Israel declares third security zone south of Litani.

―
"Oppression is worse than killing." — Quran 2:191
Ibn Kathir: Refers to persecution and displacement as graver than combat.
```

### Example: person (thematic)

```
CONTEXT: Sergey Lavrov

ROLE
Russia's foreign minister since 2004. Longest-serving since the Soviet era.

POSITION
Frames the war in Ukraine as NATO provocation. Advocates multipolar world order against Western dominance.

RELATIONSHIPS
Close to Putin's inner circle but seen as a diplomat, not a hardliner. Key interlocutor for Gulf and African states.

RELEVANCE
Hungary's Szijjártó consulting Lavrov before EU votes signals a fracture in European unity on Russia.
```

### Example: place (hybrid)

```
CONTEXT: Strait of Hormuz

WHAT IT IS
21-mile chokepoint between Iran and Oman. 20% of global oil passes through daily.

WHY IT MATTERS
Iran has threatened to close it in every major confrontation since 1980. A blockade would spike oil prices globally within hours.

HISTORY
1988  US and Iran clash in Operation Praying Mantis after mine strikes.
2019  Iran seizes British tanker, tanker wars resume.
2026  IRGC turns back container ship. Gulf states on highest alert.
```

## Display

### Mobile
- "context" button in article meta row (same pattern as "sources")
- Opens bottom sheet with scrollable content
- Section headers in small caps, text in regular weight

### Web
- Collapsible `<details>` section below sources
- Same typography as concept tags — subtle, earned depth

## Cost

Quality over economy — a good context brief is worth more than saving a few cents.

- Wikipedia API: free, no auth
- Tarteel MCP: free, no auth
- Opus generation: generous token budget per brief — no artificial compression. A complex conflict brief might use 1,000+ output tokens and that's fine.
- Wikipedia input: 5-10 extracts per brief (~2,000-5,000 input tokens) — fetch more rather than fewer
- Tafsir validation: +2,000-3,000 input tokens when verse anchoring fires
- Runs every cycle (5x/day) but only generates when something is missing or stale — most cycles will produce 0 briefs, occasionally 1-3
- Storage: in story ledger JSON, persists across cycles

## Dependencies

- Story ledger (`content/.story-ledger.json`) — already has thread tracking
- Wikipedia REST API — free, no setup
- Tarteel MCP (`https://mcp.tarteel.ai/mcp`) — free, no auth, SSE transport, adds `ayah_tafsir` + `ayah_translation`
- NewsAPI.ai concepts — Wikipedia URIs included in raw API response; requires one-line fix to `extractConcepts()` to preserve them
- **Required code change:** `fetch-news-api.js:385` — change `.map(c => c.label?.eng)` to `.map(c => ({ label: c.label?.eng, uri: c.uri }))` and update downstream consumers
- Opus — already in the pipeline
