// Dev-only block gallery — every block type, every variant, hand-crafted
// fixtures. Navigate here to verify that renderers work without going through
// the API / generator / mobile fetch path. Unreachable in production builds.

import type { ArticleBlock } from '@shared/types';
import { Fragment, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { renderBlocks } from '../../components/blocks';
import { Text } from '../../components/primitives';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { makeMarkdownStyles } from '../../lib/markdown';
import { useOpenLink } from '../../lib/open-link';

// One source string per fixture block that needs a citation. Index here →
// `block.source` index on each block.
const FIXTURE_SOURCES = [
  'FRED · EIA · as of 2026-04-22',
  'World Bank · 2024',
  'IMF Article IV · 2024',
  'IEA · USGS · 2024',
];

const SECTIONS: { title: string; subtitle?: string; blocks: ArticleBlock[] }[] = [
  {
    title: 'Trend — single series',
    subtitle: 'baseline polyline + smooth curve + on-canvas source stamp',
    blocks: [
      {
        type: 'trend',
        label: 'Brent crude (USD/bbl)',
        unit: 'USD',
        values: [
          67.7, 66.7, 65.5, 68.2, 67.7, 70.3, 70.9, 71.0, 72.3, 67.7, 70.0, 71.2, 69.9, 70.5, 71.2,
          71.0, 71.5, 69.8, 70.0, 70.8, 69.8, 71.8, 73.2, 72.8, 71.9, 71.2, 70.7, 71.7, 71.3, 77.2,
        ],
        periods: [
          '2026-03-24',
          '2026-03-25',
          '2026-03-26',
          '2026-03-27',
          '2026-03-28',
          '2026-03-29',
          '2026-03-30',
          '2026-03-31',
          '2026-04-01',
          '2026-04-02',
          '2026-04-03',
          '2026-04-04',
          '2026-04-05',
          '2026-04-06',
          '2026-04-07',
          '2026-04-08',
          '2026-04-09',
          '2026-04-10',
          '2026-04-11',
          '2026-04-12',
          '2026-04-13',
          '2026-04-14',
          '2026-04-15',
          '2026-04-16',
          '2026-04-17',
          '2026-04-18',
          '2026-04-19',
          '2026-04-20',
          '2026-04-21',
          '2026-04-22',
        ],
        highlight: 'last',
        source: 0,
      },
    ],
  },
  {
    title: 'Trend — multi-series',
    subtitle: 'Brent vs WTI — inline legend + stacked scrub readout',
    blocks: [
      {
        type: 'trend',
        label: 'Brent vs WTI (USD/bbl)',
        unit: 'USD',
        series: [
          {
            label: 'Brent',
            values: [67.7, 70.3, 71.0, 70.0, 71.2, 71.5, 70.8, 73.2, 71.2, 77.2],
            highlight: 'last',
          },
          {
            label: 'WTI',
            values: [63.4, 66.1, 67.2, 66.0, 67.5, 67.9, 67.0, 69.6, 67.5, 73.5],
            highlight: 'last',
          },
        ],
        periods: [
          '2026-04-13',
          '2026-04-14',
          '2026-04-15',
          '2026-04-16',
          '2026-04-17',
          '2026-04-18',
          '2026-04-19',
          '2026-04-20',
          '2026-04-21',
          '2026-04-22',
        ],
        source: 0,
      },
    ],
  },
  {
    title: 'Trend — historical envelope',
    subtitle: 'translucent band shows 5-year monthly range behind the live series',
    blocks: [
      {
        type: 'trend',
        label: 'Brent — current vs 5y monthly range',
        unit: 'USD',
        values: [70, 72, 71, 73, 75, 77, 78, 80, 79, 81, 83, 82],
        band: {
          low: [40, 42, 41, 43, 45, 46, 47, 48, 49, 50, 51, 50],
          high: [105, 110, 108, 112, 115, 118, 120, 122, 121, 123, 125, 124],
          label: '5y range',
        },
        periods: [
          '2025-05',
          '2025-06',
          '2025-07',
          '2025-08',
          '2025-09',
          '2025-10',
          '2025-11',
          '2025-12',
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
        ],
        highlight: 'last',
        source: 0,
      },
    ],
  },
  {
    title: 'Trend — log scale',
    subtitle: 'GDP per capita range from $500 to $80k unreadable on linear',
    blocks: [
      {
        type: 'trend',
        label: 'GDP per capita, selected (USD)',
        unit: 'USD',
        values: [500, 1200, 4500, 12000, 35000, 70000],
        periods: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
        scale: 'log',
        source: 1,
      },
    ],
  },
  {
    title: 'Locations — basic',
    subtitle: 'binary highlight, country chips below',
    blocks: [
      {
        type: 'locations',
        codes: ['SO', 'ET', 'DJ', 'ER', 'YE'],
        label: 'Horn of Africa',
      },
    ],
  },
  {
    title: 'Locations — site markers',
    subtitle: 'specific port positions overlaid on the regional map',
    blocks: [
      {
        type: 'locations',
        codes: ['SO', 'ET', 'DJ', 'YE'],
        label: 'Gulf of Aden chokepoint',
        markers: [
          { lat: 10.4396, lng: 45.0143, label: 'Berbera port' },
          { lat: 11.5722, lng: 43.1456, label: 'Djibouti port' },
          { lat: 12.7806, lng: 45.0356, label: 'Aden' },
        ],
      },
    ],
  },
  {
    title: 'Locations — choropleth',
    subtitle: 'fill intensity ramps from low to high value',
    blocks: [
      {
        type: 'locations',
        codes: ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'],
        label: 'GCC oil revenue share of total',
        valueLabel: 'oil share of govt revenue',
        values: [
          { cc: 'KW', value: 88 },
          { cc: 'QA', value: 78 },
          { cc: 'SA', value: 60 },
          { cc: 'OM', value: 55 },
          { cc: 'BH', value: 48 },
          { cc: 'AE', value: 35 },
        ],
        source: 2,
      },
    ],
  },
  {
    title: 'Compare — basic (weighted)',
    subtitle: 'single pill per row + proportional bar chart behind',
    blocks: [
      {
        type: 'compare',
        label: 'Sovereign reserves',
        rows: [
          { label: 'Saudi Arabia', cc: 'SA', value: '$650bn', weight: 650 },
          { label: 'UAE', cc: 'AE', value: '$200bn', weight: 200 },
          { label: 'Kuwait', cc: 'KW', value: '$150bn', weight: 150 },
          { label: 'Qatar', cc: 'QA', value: '$80bn', weight: 80 },
        ],
      },
    ],
  },
  {
    title: 'Compare — stacked segments',
    subtitle: 'composition variant — each row is a stacked bar',
    blocks: [
      {
        type: 'compare',
        label: 'GCC government revenue mix, 2024 est.',
        rows: [
          {
            label: 'Saudi Arabia',
            cc: 'SA',
            value: '$280bn',
            segments: [
              { value: 60, tone: 'unfavorable', label: 'oil' },
              { value: 25, tone: 'neutral', label: 'tax' },
              { value: 15, tone: 'favorable', label: 'other' },
            ],
          },
          {
            label: 'UAE',
            cc: 'AE',
            value: '$140bn',
            segments: [
              { value: 35, tone: 'unfavorable' },
              { value: 45, tone: 'neutral' },
              { value: 20, tone: 'favorable' },
            ],
          },
          {
            label: 'Qatar',
            cc: 'QA',
            value: '$78bn',
            segments: [
              { value: 78, tone: 'unfavorable' },
              { value: 12, tone: 'neutral' },
              { value: 10, tone: 'favorable' },
            ],
          },
          {
            label: 'Kuwait',
            cc: 'KW',
            value: '$70bn',
            segments: [
              { value: 88, tone: 'unfavorable' },
              { value: 4, tone: 'neutral' },
              { value: 8, tone: 'favorable' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Timeline',
    subtitle: 'Gantt-style events + spans + chronological detail list',
    blocks: [
      {
        type: 'timeline',
        label: 'Afghanistan: the long arc',
        events: [
          { year: '1978', label: 'Saur Revolution' },
          { year: '1979', label: 'Soviet invasion', emphasis: 'pivot' },
          { year: '1988', label: 'Geneva Accords' },
          { year: '1992', label: 'Najibullah collapse' },
          { year: '1996', label: 'Taliban takes Kabul' },
          { year: '2001', label: 'US invasion' },
          { year: '2021', label: 'Taliban returns' },
        ],
        spans: [
          { from: '1979', to: '1989', label: 'Soviet occupation', tone: 'unfavorable' },
          { from: '2001', to: '2021', label: 'US/NATO presence', tone: 'neutral' },
        ],
      },
    ],
  },
  {
    title: 'Rank',
    subtitle: 'subject country positioned among peers on one metric',
    blocks: [
      {
        type: 'rank',
        metric: 'Debt-to-GDP, selected emerging markets',
        unit: '%',
        subjectCc: 'PK',
        peers: [
          { cc: 'PK', value: 75 },
          { cc: 'IN', value: 60 },
          { cc: 'BD', value: 40 },
          { cc: 'LK', value: 115 },
          { cc: 'NP', value: 50 },
          { cc: 'TR', value: 38 },
          { cc: 'EG', value: 95 },
          { cc: 'NG', value: 40 },
          { cc: 'KE', value: 70 },
        ],
        source: 2,
      },
    ],
  },
  {
    title: 'Sankey',
    subtitle: 'flow ribbons between weighted nodes — circular debt cascade',
    blocks: [
      {
        type: 'sankey',
        label: "Pakistan's circular debt loop",
        nodes: [
          { id: 'consumers', label: 'Consumers' },
          { id: 'discos', label: 'DISCOs' },
          { id: 'gencos', label: 'Generators' },
          { id: 'fuel', label: 'Fuel' },
          { id: 'budget', label: 'Federal' },
        ],
        links: [
          { source: 'consumers', target: 'discos', value: 2400 },
          { source: 'discos', target: 'gencos', value: 1800 },
          { source: 'gencos', target: 'fuel', value: 1100 },
          { source: 'discos', target: 'budget', value: 600 },
          { source: 'budget', target: 'discos', value: 600 },
        ],
        source: 2,
      },
    ],
  },
  {
    title: 'Treemap',
    subtitle: 'composition-at-a-glance — China vs everyone',
    blocks: [
      {
        type: 'treemap',
        label: 'Global primary aluminum, 2024 (mn tonnes)',
        items: [
          { label: 'China', value: 43.0 },
          { label: 'India', value: 4.1 },
          { label: 'Russia', value: 3.8 },
          { label: 'UAE', value: 2.7 },
          { label: 'Canada', value: 2.6 },
          { label: 'Australia', value: 1.5 },
          { label: 'Bahrain', value: 1.5 },
          { label: 'Norway', value: 1.4 },
          { label: 'USA', value: 0.7 },
        ],
        source: 3,
      },
    ],
  },
  {
    title: 'Prose',
    subtitle: 'inline markdown — `**bold**` + `*italic*` only',
    blocks: [
      {
        type: 'prose',
        text: 'The technical term is *snapback* — the mechanism allowing any JCPOA party to unilaterally restore UN sanctions. It expires in **October 2025**.',
      },
    ],
  },
  {
    title: 'Quote',
    subtitle: 'italic body + speaker + year',
    blocks: [
      {
        type: 'quote',
        text: 'In all governments, there is a perpetual intestine struggle, open or secret, between Authority and Liberty.',
        speaker: 'David Hume, "Of the Origin of Government"',
        year: '1777',
      },
    ],
  },
  {
    title: 'Actors',
    subtitle: 'cast list with role, tenure, country flag',
    blocks: [
      {
        type: 'actors',
        label: 'the cast at Geneva',
        people: [
          {
            name: 'Mikhail Gorbachev',
            role: 'Soviet General Secretary',
            years: '1985–1991',
            cc: 'RU',
          },
          { name: 'Zia-ul-Haq', role: 'Pakistani President', years: '1978–1988', cc: 'PK' },
          { name: 'William Casey', role: 'CIA Director', years: '1981–1987', cc: 'US' },
          {
            name: 'Prince Turki al-Faisal',
            role: 'Saudi intelligence chief',
            years: '1979–2001',
            cc: 'SA',
          },
        ],
      },
    ],
  },
  {
    title: 'Quiz',
    subtitle: 'tap an option to reveal the answer + explanation',
    blocks: [
      {
        type: 'quiz',
        question: 'In merit-order dispatch, which power plant runs last?',
        options: [
          'The plant with the lowest fixed cost',
          'The plant with the highest marginal cost',
          'The plant with the newest equipment',
          'The plant closest to the load center',
        ],
        correct: 1,
        explanation:
          'Merit order dispatches plants from cheapest marginal cost to most expensive — the highest-cost plant only runs when demand exceeds the cheaper capacity.',
      },
    ],
  },
];

export default function BlockGalleryScreen() {
  const { colors, font, typography } = useTheme();
  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );
  const openLink = useOpenLink();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.scroll}
    >
      <Text variant="title" tone="emphasis" style={[styles.title, font.bold]}>
        Block Gallery
      </Text>
      <Text variant="caption" tone="secondary" style={styles.intro}>
        Every block type, every variant, hand-crafted fixtures. Dev-only route — not reachable in
        production. Edit `mobile/app/__dev/blocks.tsx` to add cases.
      </Text>

      {SECTIONS.map((section, idx) => (
        <Fragment key={section.title}>
          <View style={styles.sectionHeader}>
            <Text variant="labelXs" tone="accent" style={styles.sectionLabel}>
              {`§${idx + 1} · ${section.title.toUpperCase()}`}
            </Text>
            {section.subtitle ? (
              <Text variant="caption" tone="secondary" style={styles.sectionSubtitle}>
                {section.subtitle}
              </Text>
            ) : null}
          </View>
          {renderBlocks(section.blocks, {
            mdStyles,
            openLink,
            variant: 'article',
            sources: FIXTURE_SOURCES,
          })}
        </Fragment>
      ))}

      <View style={styles.footer}>
        <Text variant="labelXs" tone="secondary">
          END · {SECTIONS.length} sections rendered
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.xxl,
  },
  title: {
    marginTop: SPACING.lg,
  },
  intro: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    marginBottom: SPACING.xxs,
  },
  sectionSubtitle: {
    marginBottom: SPACING.xs,
  },
  footer: {
    marginTop: SPACING.xxl,
    alignItems: 'center',
  },
});
