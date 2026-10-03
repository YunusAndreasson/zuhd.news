// The AI labs the app's `AI models` list follows.
//
// Shape: { id, name, epochOrgs, companyName, iso2, blurb }
//   - name        — the name a reader knows the lab by: `Meta`, not `Meta AI`.
//   - epochOrgs   — the `Organization` strings Epoch AI files the lab's models
//                   under, pinned. A model is the lab's when any of its
//                   comma-separated organizations is one of these, so a model
//                   filed under `Google DeepMind,Google` counts once for
//                   Google DeepMind. Assertions, as a company's `match` is: a
//                   lab none of whose strings appears in the file is reported
//                   and left out, never guessed at.
//   - companyName — the lab's name in Epoch's company files (revenue reports,
//                   funding rounds), where it has one. Absent for a lab that
//                   is a division of a listed company with no figures of its
//                   own (Google DeepMind, Meta, Alibaba).
//   - blurb       — what the lab is, in a sentence or two, written to stay
//                   true: no rank, no score, no model version, no year. It is
//                   the paragraph under the chart, and the app drops a card
//                   that has none (`companies.test.js` holds the same bounds).
//
// Which labs
// ----------
// The ten labs with a model scored on Epoch's index in the year to 2026-10-04
// and more than a handful of models behind it. The list is editorial and
// fixed, like the company list: a lab is added by hand, with its strings
// probed against the file first. A lab whose newest scored model is over a
// year old is dropped by the fetcher with a log line, not by an edit here.
//
// Not listed, each for a reason: the Technology Innovation Institute (its
// newest scored model is from 2024), Microsoft and Amazon (the same), and the
// labs with one or two scored models (MiniMax, Nvidia, Thinking Machines),
// where "the lab's best over time" is a single point.

/**
 * @typedef {Object} AiLabEntry
 * @property {string} id
 * @property {string} name
 * @property {string[]} epochOrgs
 * @property {string} [companyName]
 * @property {string} iso2
 * @property {string} blurb
 */

/** @type {AiLabEntry[]} */
export const AI_LABS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    epochOrgs: ['Anthropic'],
    companyName: 'Anthropic',
    iso2: 'US',
    blurb:
      'A San Francisco company that makes the Claude models and sells them mostly to businesses and software developers. Amazon and Google are among its largest backers.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    epochOrgs: ['OpenAI'],
    companyName: 'OpenAI',
    iso2: 'US',
    blurb:
      'The San Francisco company behind ChatGPT, the assistant that brought these models to a mass audience, and the GPT models under it. Microsoft is its largest outside backer.',
  },
  {
    id: 'google-deepmind',
    name: 'Google DeepMind',
    epochOrgs: ['Google DeepMind', 'Google'],
    iso2: 'US',
    blurb:
      'Google’s AI research arm, run from London, which builds the Gemini models that answer in Google’s search, run on its phones and are sold through its cloud.',
  },
  {
    id: 'meta',
    name: 'Meta',
    epochOrgs: ['Meta AI'],
    iso2: 'US',
    blurb:
      'The AI arm of the company that owns Facebook, Instagram and WhatsApp. It builds the assistant inside those apps and has released many of its models for anyone to run.',
  },
  {
    id: 'xai',
    name: 'xAI',
    epochOrgs: ['xAI'],
    companyName: 'xAI',
    iso2: 'US',
    blurb:
      'Elon Musk’s AI company, which makes the Grok models and offers them through the X social network. It builds its own data centres to train them.',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    epochOrgs: ['Mistral AI'],
    companyName: 'Mistral AI',
    iso2: 'FR',
    blurb:
      'A Paris company that builds language models, many released openly, and sells them to European firms and governments that want a supplier outside the United States and China.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    epochOrgs: ['DeepSeek'],
    companyName: 'DeepSeek',
    iso2: 'CN',
    blurb:
      'A lab in Hangzhou that grew out of a hedge fund. Its openly released models showed that capable systems could be built for a fraction of what the largest US labs spend.',
  },
  {
    id: 'alibaba',
    name: 'Alibaba',
    epochOrgs: ['Alibaba'],
    iso2: 'CN',
    blurb:
      'The Chinese online-shopping and cloud company. Its Qwen models are released openly in many sizes, and other developers build on them widely.',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    epochOrgs: ['Moonshot'],
    companyName: 'Moonshot AI',
    iso2: 'CN',
    blurb:
      'A Beijing startup that makes the Kimi assistant and the models under it, and releases its strongest models for anyone to run.',
  },
  {
    id: 'zhipu',
    name: 'Zhipu',
    epochOrgs: ['Z.ai (Zhipu AI)'],
    companyName: 'Z.ai (Zhipu)',
    iso2: 'CN',
    blurb:
      'A Beijing company that grew out of Tsinghua University and makes the GLM models, sold mostly to Chinese businesses and state bodies. It also trades as Z.ai.',
  },
]
