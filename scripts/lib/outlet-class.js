// Which outlets are state media or advocacy, and how an article must name them
// when one of them is the story's only source.
//
// Editorial decision, 2026-09-25: such stories are allowed but labelled. In the
// week to that date 10 articles ran on a state outlet alone (Mehr 6, TASS 3,
// RT 1) and 11 on an advocacy outlet alone, every one stated in the site's own
// voice — a TASS claim read exactly like a verified fact. The body rule
// against naming outlets ("never 'according to Reuters'") exists so that the
// site's voice carries the verified facts; a claim only one of these outlets
// makes is not one, so for these the rule inverts.
//
// Keyed by registrable domain, not display name: NewsAPI and RSS spell names
// differently ("Mehr News Agency", "Mehr News"), and the URL is the one field
// every source has.

/** @typedef {{ kind: 'state' | 'advocacy', label: string, aliases: string[] }} OutletClass */

/** @type {Record<string, OutletClass>} */
const OUTLETS = {
  // State-controlled outlets.
  'rt.com': { kind: 'state', label: 'Russian state outlet RT', aliases: ['RT'] },
  'tass.com': { kind: 'state', label: 'Russian state news agency TASS', aliases: ['TASS'] },
  'tass.ru': { kind: 'state', label: 'Russian state news agency TASS', aliases: ['TASS'] },
  'sputnikglobe.com': { kind: 'state', label: 'Russian state outlet Sputnik', aliases: ['Sputnik'] },
  'ria.ru': { kind: 'state', label: 'Russian state news agency RIA Novosti', aliases: ['RIA'] },
  'xinhuanet.com': { kind: 'state', label: 'Chinese state news agency Xinhua', aliases: ['Xinhua'] },
  'news.cn': { kind: 'state', label: 'Chinese state news agency Xinhua', aliases: ['Xinhua'] },
  'cgtn.com': { kind: 'state', label: 'Chinese state broadcaster CGTN', aliases: ['CGTN'] },
  'globaltimes.cn': { kind: 'state', label: 'Chinese state-run Global Times', aliases: ['Global Times'] },
  'chinadaily.com.cn': { kind: 'state', label: 'Chinese state-run China Daily', aliases: ['China Daily'] },
  'kcna.kp': { kind: 'state', label: 'North Korean state news agency KCNA', aliases: ['KCNA'] },
  'presstv.ir': { kind: 'state', label: 'Iranian state broadcaster Press TV', aliases: ['Press TV'] },
  'irna.ir': { kind: 'state', label: 'Iranian state news agency IRNA', aliases: ['IRNA'] },
  'mehrnews.com': { kind: 'state', label: 'Iranian state-affiliated Mehr News Agency', aliases: ['Mehr'] },
  'tasnimnews.com': { kind: 'state', label: 'IRGC-affiliated Tasnim News Agency', aliases: ['Tasnim'] },
  'farsnews.ir': { kind: 'state', label: 'IRGC-affiliated Fars News Agency', aliases: ['Fars'] },
  'sana.sy': { kind: 'state', label: 'Syrian state news agency SANA', aliases: ['SANA'] },
  'trtworld.com': { kind: 'state', label: 'Turkish state broadcaster TRT World', aliases: ['TRT'] },
  'aa.com.tr': { kind: 'state', label: 'Turkish state news agency Anadolu', aliases: ['Anadolu'] },
  'spa.gov.sa': { kind: 'state', label: 'the Saudi Press Agency', aliases: ['Saudi Press Agency', 'SPA'] },
  'wam.ae': { kind: 'state', label: 'UAE state news agency WAM', aliases: ['WAM'] },
  // Advocacy and opinion-forward outlets (select-prompt.md, "Sourcing discipline").
  'responsiblestatecraft.org': { kind: 'advocacy', label: 'Responsible Statecraft, the Quincy Institute’s magazine', aliases: ['Responsible Statecraft'] },
  'quincyinst.org': { kind: 'advocacy', label: 'the Quincy Institute', aliases: ['Quincy Institute'] },
  'declassifieduk.org': { kind: 'advocacy', label: 'Declassified UK', aliases: ['Declassified UK'] },
  'inkstickmedia.com': { kind: 'advocacy', label: 'the advocacy outlet Inkstick', aliases: ['Inkstick'] },
}

/** @param {string | undefined | null} url */
export function outletClass(url) {
  if (typeof url !== 'string') return null
  let host
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    if (OUTLETS[h]) return OUTLETS[h]
  }
  return null
}

/**
 * The class of a story's sourcing when every source is state or advocacy —
 * the case that must be labelled — or null when at least one independent
 * source carries it.
 * @param {Array<{ url?: string | null }>} sources
 * @returns {OutletClass | null}
 */
export function soleClassifiedSource(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null
  const classes = sources.map((s) => outletClass(s?.url))
  if (classes.some((c) => c === null)) return null
  return classes[0]
}

/**
 * Does the body name the outlet? Any alias, as a whole word, case-sensitive for
 * short all-caps names ("RT", "SPA") so "art" and "spa" do not count.
 * @param {string} body
 * @param {OutletClass} cls
 */
export function bodyNamesOutlet(body, cls) {
  return cls.aliases.some((a) => {
    const flags = a.length <= 4 && a === a.toUpperCase() ? '' : 'i'
    return new RegExp(`(^|[^\\w])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, flags).test(body)
  })
}

/** Every outlet's first alias — the prompts name each one, and a test holds them to this list. */
export const outletNames = () => [...new Set(Object.values(OUTLETS).map((o) => o.aliases[0]))]
