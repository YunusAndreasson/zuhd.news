// Situations a United Nations body has determined to be genocide.
//
// ── Why this is a hand-kept file and not a feed ────────────────────────────
//
// Every other overlay on the map comes from a machine: GDACS pushes disasters,
// PortWatch pushes vessel counts, UCDP pushes conflict events. There is no feed
// for this. The finding that a genocide is being committed is made by a named
// UN body, in a numbered document, on a date — and that is the only thing that
// belongs on a map that claims to show it. So the record is written by hand and
// carries its own citation, and a mark cannot appear on the map without one.
//
// ── The bar ────────────────────────────────────────────────────────────────
//
// `determination` means a UN body has stated the conclusion: that genocide is
// being or has been committed. Nothing else clears the bar for the mark.
//
// `risk` is the other thing UN bodies say, and it is said far more often — the
// Special Advisers on the Prevention of Genocide warn of "risk", "serious
// risk", "indicators". Those warnings matter, and they are recorded here so
// that promoting one is a data edit rather than research done twice. But they
// are not the same statement, and the map must not draw them as if they were.
// `GENOCIDE_MARKED` is what reaches the map; the full list is what documents
// the decision.
//
// A determination by a state, a parliament, an NGO or a court that is not a UN
// organ does not qualify *for this layer* — not because those findings are
// worth less, but because the layer says "as determined by the UN", and a mark
// that quietly means four different things is a mark that means nothing. The
// ICJ is the one place this gets subtle: it is a UN organ, but provisional
// measures are a finding of *plausible risk*, not of genocide, and are filed
// under `risk` until a judgment on the merits says otherwise.

export type GenocideFinding = 'determination' | 'risk'

export interface GenocideSituation {
  id: string
  /** What the mark is over — the place, as the people there name it. */
  name: string
  /** ISO2 of the country page to link to, where there is one. */
  iso2?: string
  /**
   * What that profile is called.
   *
   * `name` is the place the mark sits on and `iso2` is the country page behind
   * it, and they are not the same word — the Gaza mark links to Palestine, the
   * Rakhine mark to Myanmar. Labelling the link "Gaza in profile" and landing
   * the reader on Palestine would be the map misnaming a country page it
   * itself built.
   */
  profile?: string
  lat: number
  lng: number
  finding: GenocideFinding
  /** The UN organ that made the finding. Named, not "the UN". */
  body: string
  /** The document it was made in, cited as it is cited. */
  document: string
  /** ISO date of the finding. */
  date: string
  /** The finding in the body's own terms, short enough to sit on a card. */
  summary: string
  /** Where a reader goes to read it themselves. */
  url: string
  /** When the situation began, for a card that has to say "ongoing since". */
  since: string
}

/**
 * The record.
 *
 * Ordered by the date of the finding, newest first. Editing this list is how
 * the layer changes — there is no other input.
 */
export const GENOCIDE_SITUATIONS: GenocideSituation[] = [
  {
    id: 'gaza',
    name: 'Gaza',
    iso2: 'PS',
    profile: 'Palestine',
    lat: 31.42,
    lng: 34.36,
    finding: 'determination',
    body: 'UN Independent International Commission of Inquiry on the Occupied Palestinian Territory',
    document: 'Report to the Human Rights Council, A/HRC/60/CRP.3',
    date: '2025-09-16',
    summary:
      'The Commission concluded that genocide has been and is being committed in Gaza, finding four of the five acts defined in the Genocide Convention and that Israeli authorities acted with intent to destroy Palestinians in Gaza as a group.',
    url: 'https://www.ohchr.org/en/hr-bodies/hrc/co-israel/index',
    since: '2023-10',
  },
  {
    id: 'rohingya',
    name: 'Rakhine',
    iso2: 'MM',
    profile: 'Myanmar',
    lat: 20.79,
    lng: 92.9,
    finding: 'determination',
    body: 'UN Independent International Fact-Finding Mission on Myanmar',
    document: 'Report to the Human Rights Council, A/HRC/39/64',
    date: '2018-09-12',
    summary:
      'The Mission found that the crimes committed against the Rohingya in Rakhine State were carried out with genocidal intent, and that the situation continues to meet the threshold of an ongoing genocide against those who remain.',
    url: 'https://www.ohchr.org/en/hr-bodies/hrc/myanmar-ffm/index',
    since: '2016-10',
  },
  {
    id: 'darfur',
    name: 'Darfur',
    iso2: 'SD',
    profile: 'Sudan',
    lat: 13.45,
    lng: 22.45,
    // Recorded, not marked. The UN's Special Adviser has repeatedly warned of
    // the risk and of ethnically-targeted atrocities in Darfur; the finding
    // that genocide *is being committed* has come from other bodies, not from
    // a UN organ. Promote this to `determination` — with the document that
    // does it — the day that changes, and the mark appears on its own.
    finding: 'risk',
    body: 'UN Special Adviser on the Prevention of Genocide',
    document: 'Statements on the situation in Darfur, Sudan',
    date: '2025-01-24',
    summary:
      'The Special Adviser warned of ethnically-targeted killings and a serious risk of genocide against the Masalit and other non-Arab communities in West Darfur.',
    url: 'https://www.un.org/en/genocideprevention/statements.shtml',
    since: '2023-04',
  },
]

/**
 * What the map draws.
 *
 * A separate export rather than a filter at the call site, so every consumer —
 * the web map, the app, anything after them — applies the same bar without
 * having to know what the bar is.
 */
export const GENOCIDE_MARKED: GenocideSituation[] = GENOCIDE_SITUATIONS.filter(
  (s) => s.finding === 'determination',
)

/**
 * The published shape at `/api/genocide.json`, written by `scripts/build.js`
 * straight from `GENOCIDE_MARKED`.
 *
 * It lives here rather than in `types.ts` because it is this file's own
 * contract: the endpoint exists so a consumer that cannot import TypeScript —
 * or that must see a new determination without waiting for a release — reads
 * the same record, filtered by the same bar. The mobile app does both: it
 * fetches this, and falls back to the bundled `GENOCIDE_MARKED` when the
 * network is gone.
 *
 * Deliberately has no `generated` field. Every other snapshot on this site is
 * a machine's reading of the world at a moment; this one is a list of findings
 * that were true before the build ran and stay true after it, so a build
 * timestamp would only invite a reader to treat a determination as stale.
 */
export interface GenocideSnapshot {
  situations: GenocideSituation[]
}
