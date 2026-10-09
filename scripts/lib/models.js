// Every model the pipeline calls, in one place.
//
// The ids were spelled out in sixteen files, and each change of model was a
// search across them: Opus 4.8 to 5 to 5.5 and Sonnet 4.6 to 5 to 5.5 inside
// one summer, and every time something was left a version behind. A use names
// what it is; the id it gets, and the variables that override it, are here.
//
// Pinned by id, never by alias: an alias moves under a cycle without a commit.

export const OPUS = 'claude-opus-5-5'
export const SONNET = 'claude-sonnet-5-5'
export const HAIKU = 'claude-haiku-5-5'

/**
 * Each caller's model, and the environment variables that override it; the
 * first one set wins. A cycle exports `ZUHD_MODEL`, so within one the uses
 * that read it follow the writer's model.
 *
 * @satisfies {Record<string, { model: string, env: string[] }>}
 */
const USES = {
  /** Picks the cycle's stories: the one editorial judgement, so the strongest model. */
  selector: { model: OPUS, env: ['ZUHD_SELECTOR_MODEL'] },
  /** The writer, the editor, the two push lines, and the X and Instagram captions. */
  session: { model: SONNET, env: ['ZUHD_MODEL'] },
  /** The daily tuning session: bounded parameter changes that govern the next day's cycles. */
  tuner: { model: OPUS, env: [] },
  /** The card headline for the story mirrored to social. */
  socialPick: { model: SONNET, env: ['ZUHD_SOCIAL_PICK_MODEL', 'ZUHD_MODEL'] },
  /** The audio briefing's script. */
  briefing: { model: OPUS, env: ['ZUHD_BRIEFING_MODEL'] },
  /** The two sentences under each instrument on the rail. */
  dispatch: { model: OPUS, env: ['ZUHD_DISPATCH_MODEL'] },
  /** The same, for the events block. */
  events: { model: OPUS, env: ['ZUHD_EVENTS_MODEL'] },
  /** The narrative for each Orange or Red disaster alert. */
  gdacs: { model: OPUS, env: [] },
  /** The Swedish desk: register is the whole job. */
  swedish: { model: SONNET, env: ['ZUHD_SV_MODEL'] },
  /** Short titles for Polymarket questions. */
  polymarketTitles: { model: SONNET, env: ['PM_TITLE_MODEL'] },
  /** Entity disambiguation and source angles, batched. */
  haiku: { model: HAIKU, env: [] },
}

/**
 * The model id for a use.
 *
 * @param {keyof typeof USES} use
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function modelFor(use, env = process.env) {
  for (const name of USES[use].env) {
    const set = env[name]
    if (set) return set
  }
  return USES[use].model
}

/** The uses, for a test to walk. */
export const MODEL_USES = /** @type {(keyof typeof USES)[]} */ (Object.keys(USES))
