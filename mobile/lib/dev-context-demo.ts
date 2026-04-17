/**
 * Dev-only canonical ContextBrief for evaluating the block renderer inside
 * the context bottom sheet.
 *
 * One static, rich brief that exercises every block variant — spanning trend
 * + spanning map above the timeline, then a mix of prose entries and entries
 * with quote / actors / compare / locations. Lazy-imported behind __DEV__ so
 * Metro's dead-code elimination strips this from release bundles.
 */

import type { ContextBrief } from '../types';

export const DEV_DEMO_BRIEF: ContextBrief = {
  id: 'dev-demo-afghanistan',
  type: 'thread',
  label: 'Afghanistan: the long arc',
  category: 'politics',
  articleCount: 14,
  generatedAt: '2026-04-17T00:00:00Z',

  // Citation strings referenced by blocks via `source` index.
  sources: [
    'UN OCHA \u00b7 2024',
    'Congressional Research Service \u00b7 2022',
    'SIPRI \u00b7 2023',
    'Responsible Statecraft \u00b7 2024',
  ],

  // ── Spanning (arc) blocks — the whole picture, rendered above the timeline.
  blocks: [
    {
      type: 'prose',
      text: 'Afghanistan has been a **corridor of empires** for forty years — invaded, abandoned, and reinvaded. The arc below marks intensity across the full span; the timeline that follows walks the moments that shaped it.',
    },
    {
      type: 'trend',
      values: [12, 38, 64, 82, 95, 72, 55, 78, 40],
      label: 'war intensity',
      periods: ['1979', '1984', '1989', '1996', '2001', '2009', '2014', '2021', '2024'],
      highlight: 'max',
      // Three events, short labels — enough to narrate the arc without
      // crowding the top of the chart on a phone-width canvas.
      annotations: [
        { atIndex: 0, label: 'invasion' },
        { atIndex: 4, label: 'US war' },
        { atIndex: 7, label: 'return' },
      ],
      source: 1,
    },
    {
      type: 'locations',
      codes: ['AF', 'PK', 'RU', 'US', 'GB', 'IR', 'SA'],
      label: 'everywhere this story touched',
      source: 3,
    },
  ],

  timeline: [
    {
      year: '1978',
      heading: 'Saur Revolution',
      body: "The Marxist-Leninist People's Democratic Party seized power in Kabul, provoking an insurgency the new government could not contain.",
    },
    {
      year: '1979',
      heading: 'Soviet invasion',
      body: 'On Christmas Eve, the 40th Army crossed the Amu Darya. What Moscow expected to be a short intervention became a ten-year war.',
      blocks: [
        {
          type: 'actors',
          label: 'cast',
          people: [
            {
              name: 'Leonid Brezhnev',
              role: 'Soviet General Secretary',
              years: '1964–1982',
              cc: 'RU',
            },
            {
              name: 'Hafizullah Amin',
              role: 'Afghan President',
              years: '1979',
              cc: 'AF',
            },
            {
              name: 'Babrak Karmal',
              role: 'Soviet-installed successor',
              years: '1979–1986',
              cc: 'AF',
            },
          ],
        },
      ],
    },
    {
      year: '1985',
      heading: "Gorbachev's opening",
      body: 'A new General Secretary told the Politburo the war was unwinnable. Soviet policy began turning — cautiously — toward withdrawal.',
      blocks: [
        {
          type: 'quote',
          text: 'We must end this war, and end it with dignity.',
          speaker: 'Gorbachev, to the Politburo',
          year: '1986',
          source: 0,
        },
      ],
    },
    {
      year: '1988',
      heading: 'Geneva Accords',
      body: 'Signatories agreed Soviet forces would withdraw within a year. Arms to the mujahideen, however, continued to flow.',
      blocks: [
        {
          type: 'compare',
          label: "each power's role at Geneva",
          rows: [
            {
              label: 'United States',
              value: 'armed mujahideen',
              cc: 'US',
              tone: 'unfavorable',
              weight: 3000,
            },
            {
              label: 'Pakistan',
              value: 'channelled arms',
              cc: 'PK',
              tone: 'neutral',
              weight: 2100,
            },
            {
              label: 'Saudi Arabia',
              value: 'funded operations',
              cc: 'SA',
              tone: 'neutral',
              weight: 3000,
            },
            {
              label: 'Soviet Union',
              value: 'withdrawing',
              cc: 'RU',
              tone: 'favorable',
              weight: 500,
            },
          ],
          source: 2,
        },
      ],
    },
    {
      year: '1989',
      heading: 'Withdrawal complete',
      body: "The last Soviet soldier crossed the Friendship Bridge in February. Najibullah's government held Kabul for three more years without them.",
    },
    {
      year: '1996',
      heading: 'Taliban in Kabul',
      body: 'After years of civil war between mujahideen factions, the Taliban took Kabul and installed an emirate. Women were erased from public life.',
      blocks: [
        {
          type: 'locations',
          codes: ['AF', 'PK', 'SA', 'AE'],
          label: 'formal recognition',
          caption:
            'Only three governments extended formal diplomatic recognition to the first Taliban emirate.',
        },
      ],
    },
    {
      year: '2001',
      heading: 'US invasion',
      body: 'Following September 11, a US-led coalition removed the Taliban within two months. Reconstruction would last twenty years.',
    },
    {
      year: '2021',
      heading: 'Return',
      body: 'Twenty years after their first defeat, the Taliban retook Kabul in days as the last Western evacuations flew from the airport.',
      blocks: [
        {
          type: 'quote',
          text: 'History does not repeat itself — it rhymes.',
          speaker: 'Attributed',
          year: '2021',
        },
      ],
    },
  ],
};
