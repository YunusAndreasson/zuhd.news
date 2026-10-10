// What the hazard sources count in a country as a whole, in words.
//
// A country's page states two things no mark on the map does: how many of its
// people the IPC counts in crisis or worse, and what its last reported week of
// conflict came to. They are statements, each with its source and its dates,
// because both are old by the time they are read: an IPC analysis is months
// old and the conflict week about five weeks behind.
//
// The wording is the app's (`mobile/lib/famine-totals.ts`,
// `mobile/lib/conflict-week.ts`), which reaches it through its own number
// formatters. Here it takes plain numbers and formats them itself, so the
// site's build can use it; the app's two files can become callers when they
// are next open.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A whole number with its thousands grouped: `134,808`. */
export const formatCount = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** A count of people: exact under a million, then `19.5 million`. */
export function formatPeople(n: number): string {
  if (n < 1_000_000) return formatCount(n)
  const millions = n / 1_000_000
  return `${millions < 100 ? millions.toFixed(1) : formatCount(millions)} million`
}

/** A country's row of `/api/ipc.json`'s `totals`, as far as the sentence reads it. */
export interface HungerTotal {
  /** People the analysis covered. */
  analysed: number
  /** Of them, in Crisis (phase 3) or worse. */
  p3plus: number
  /** In Catastrophe (phase 5), where the analysis counted any. */
  p5?: number | null | undefined
  /** When the analysis is of: `Jan 2026`. */
  vintage: string
}

export interface FactLine {
  title: string
  /** Whose count it is, and of when. */
  detail: string
}

/** `19.5 million people in crisis or worse`, and what that is a share of. */
export function hungerLine(total: HungerTotal): FactLine {
  const share = Math.round((total.p3plus / total.analysed) * 100)
  return {
    title: `${formatPeople(total.p3plus)} people in crisis or worse`,
    detail: [
      `${share}% of the ${formatPeople(total.analysed)} analysed`,
      // Catastrophe alone: it is the phase a reader means by famine, and the
      // line has room for one more figure.
      ...(typeof total.p5 === 'number' && total.p5 > 0
        ? [`${formatPeople(total.p5)} in catastrophe`]
        : []),
      `IPC, ${total.vintage}`,
    ].join(' · '),
  }
}

/** A country's week of conflict, counted. */
export interface ConflictCount {
  events: number
  killed: number
  civilians: number
}

const counted = (n: number, one: string, many: string): string =>
  `${formatCount(n)} ${n === 1 ? one : many}`

/** `18 events · 31 killed · 12 civilians`. */
export const conflictLine = (c: ConflictCount): string =>
  [
    counted(c.events, 'event', 'events'),
    `${formatCount(c.killed)} killed`,
    c.civilians > 0 ? counted(c.civilians, 'civilian', 'civilians') : '',
  ]
    .filter((s) => s.length > 0)
    .join(' · ')

const dayOf = (iso: string): { label: string; month: string; day: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  if (!m || !month) return null
  return { label: `${month} ${Number(m[3])}`, month: m[2] ?? '', day: Number(m[3]) }
}

/** The week a count is of: `Aug 25–31`, or `Aug 28 – Sep 3` across a month. */
export function weekWindow(startIso: string, endIso: string): string {
  const start = dayOf(startIso)
  const end = dayOf(endIso)
  if (!start || !end) return start?.label ?? end?.label ?? ''
  if (start.label === end.label) return start.label
  return start.month === end.month ? `${start.label}–${end.day}` : `${start.label} – ${end.label}`
}
