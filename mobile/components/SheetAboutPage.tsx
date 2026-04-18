import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import type { Article } from '../types';
import { HapticPressable } from './HapticPressable';

// Copy lives with the component; the About page is one-of-a-kind and doesn't
// reuse the generic InfoSection schema. Keeping it here keeps the visual
// hierarchy and the text it shapes in the same file.

const LEAD = 'Zuhd \u2014 the discipline of doing without what you do not need.';

const MANIFESTO = [
  'Information is no longer scarce; attention is. Attention is where information becomes fact \u2014 and without facts, no truth; without truth, no trust; without trust, no shared reality.',
  'In 1971, Herbert Simon observed that a wealth of information creates a poverty of attention. Seven centuries earlier, Ibn Taymiyyah had named the discipline \u2014 zuhd: abandon what does not bring benefit. zuhd.news applies that discipline to the present.',
  'Most systems that process news today are optimized for engagement, not understanding. zuhd.news is built on a different set of values: zuhd, tabayyun, isnad, adalah, haqq. The work is automated; the alignment is not.',
];

// The article format — narrative-ordered (sequence carries meaning), so no
// staircase sort. Rendered with the same quiet vertical typography as the
// subtractions list below, forming a matched pair of mini-declaratives.
const WHATS = ['What happened.', 'Why it matters.', 'What comes next.', 'Then stop.'];

const STANCE =
  'Where a story is told from determines who is treated as a person and who as a statistic. People who bear power\u2019s consequences are the subject, not the background.';

// Ordered shortest-to-longest so the list renders as a visual staircase.
const SUBTRACTIONS = [
  'No ads.',
  'No tracking.',
  'No investors.',
  'No social login.',
  'No algorithmic feed.',
];

const NEWSROOM_LINE =
  'zuhd.news is an automated newsroom. The intelligence lives in the system; the editors stand at the edges, where judgment belongs \u2014 what qualifies as news, how it is verified, whether a pattern is oppression, when to name power. They do not write the articles; they write the rules the newsroom follows.';

const FLOW_LINE =
  'Under those rules, the newsroom reads the world, verifies what it finds, drafts each article, and augments it with live data.';

const SOURCES_BODY =
  'There is no fixed roster. Each cycle, the newsroom looks for the voices closest to the story \u2014 from international wires like Reuters and the BBC to newsrooms inside the country where it happened. No more than two of any story\u2019s sources come from the Western press. State media is included to carry a government\u2019s position, never as a substitute for independent reporting.';

const CONTEXT_BODY =
  'Every article draws on a layer of institutional data: shipping flows, exchange rates, development indicators, press-freedom scores, refugee counts, prediction markets.';

const DATA_SOURCES: { label: string; url: string }[] = [
  { label: 'World Bank \u2014 data.worldbank.org', url: 'https://data.worldbank.org/' },
  { label: 'IMF PortWatch \u2014 portwatch.imf.org', url: 'https://portwatch.imf.org/' },
  { label: 'FRED \u2014 fred.stlouisfed.org', url: 'https://fred.stlouisfed.org/' },
  { label: 'Our World in Data \u2014 ourworldindata.org', url: 'https://ourworldindata.org/' },
  { label: 'V-Dem Institute \u2014 v-dem.net', url: 'https://v-dem.net/' },
  {
    label: 'Transparency International \u2014 transparency.org',
    url: 'https://www.transparency.org/en/cpi',
  },
  { label: 'Reporters Without Borders \u2014 rsf.org', url: 'https://rsf.org/en/index' },
  { label: 'UNDP Human Development \u2014 hdr.undp.org', url: 'https://hdr.undp.org/' },
  {
    label: 'UNHCR Refugee Data \u2014 unhcr.org',
    url: 'https://www.unhcr.org/refugee-statistics/',
  },
  {
    label: 'Open Exchange Rates \u2014 openexchangerates.org',
    url: 'https://openexchangerates.org/',
  },
  { label: 'Polymarket \u2014 polymarket.com', url: 'https://polymarket.com/' },
  { label: 'REST Countries \u2014 restcountries.com', url: 'https://restcountries.com/' },
];

const PRINCIPLES: { term: string; gloss: string }[] = [
  { term: 'zuhd', gloss: 'Only what benefits the reader is published.' },
  {
    term: 'tabayyun',
    gloss:
      'Reports are verified before publication; the burden of proof rests with the source (Qur\u2019an 49:6).',
  },
  {
    term: 'isnad',
    gloss: 'Every article ends with its chain of sources, named and linked.',
  },
  { term: 'adalah', gloss: 'Sources are weighed by character, not only by content.' },
  { term: 'haqq', gloss: 'Truth is published without regard to power.' },
];

// Source names we can drop from the surfaced list — the aggregator feed
// ("Hacker News") isn't really a primary voice in the zuhd sense.
const SUPPRESS_SOURCES = new Set(['Hacker News']);

/** Unique outlet names across the current feed, sorted by how often they
 *  surfaced. Empty until the feed is loaded — the caller decides how to
 *  handle that (we just omit the dynamic line). */
function aggregateSources(articles: Article[]): string[] {
  const freq = new Map<string, number>();
  for (const a of articles) {
    for (const s of a.sources ?? []) {
      if (!s.name || SUPPRESS_SOURCES.has(s.name)) continue;
      freq.set(s.name, (freq.get(s.name) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/** Oxford-comma join: [A, B, C] -> "A, B, and C". */
function prose(list: string[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0] ?? '';
  const head = list.slice(0, -1).join(', ');
  const last = list[list.length - 1] ?? '';
  return list.length === 2 ? `${head} and ${last}` : `${head}, and ${last}`;
}

interface SheetAboutPageProps {
  articles: Article[];
}

/** Full About page with designed visual hierarchy:
 *  1. Lead (sizeLg, accent) — the hook
 *  2. Supporting statements (sizeBase, text) — the stance
 *  3. Subtraction list (sizeSm, textSecondary) — quiet rhythm of absences
 *  4. Architectural sections (smallCaps heading + body) — how it works
 *  5. Principles (italic-accent term above regular gloss) — the editorial constitution
 *  6. Closer (italic, textSecondary) — two attributions, one idea
 *
 *  The `sources` section lists actual outlets from the current feed (live),
 *  and the `context` section keeps its 12 data-provider links collapsed
 *  behind a toggle so the page doesn't dump a link wall on arrival. */
export function SheetAboutPage({ articles }: SheetAboutPageProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const openLink = useOpenLink();
  const [providersOpen, setProvidersOpen] = useState(false);

  const recentSources = useMemo(() => aggregateSources(articles), [articles]);
  const visibleSources = recentSources.slice(0, 10);
  const extraCount = Math.max(0, recentSources.length - visibleSources.length);

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  const body = {
    ...font.regular,
    fontSize: typography.sizeBase,
    lineHeight: typography.sizeBase * typography.leadingBody,
    color: colors.text,
  };

  return (
    <>
      <Animated.View entering={enter()}>
        <Text
          selectable
          style={{
            ...font.regular,
            fontSize: typography.sizeLg,
            lineHeight: typography.sizeLg * typography.leadingHeading,
            color: colors.accent,
          }}
        >
          {LEAD}
        </Text>
      </Animated.View>

      {MANIFESTO.map((line) => (
        <Animated.View key={line} entering={enter()} style={styles.block}>
          <Text selectable style={body}>
            {line}
          </Text>
        </Animated.View>
      ))}

      <Animated.View entering={enter()} style={styles.listBlock}>
        {WHATS.map((item) => (
          <Text
            key={item}
            selectable
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              lineHeight: typography.sizeSm * typography.leadingBody,
              color: colors.textSecondary,
            }}
          >
            {item}
          </Text>
        ))}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable style={body}>
          {STANCE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.listBlock}>
        {SUBTRACTIONS.map((item) => (
          <Text
            key={item}
            selectable
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              lineHeight: typography.sizeSm * typography.leadingBody,
              color: colors.textSecondary,
            }}
          >
            {item}
          </Text>
        ))}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable style={body}>
          {NEWSROOM_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable style={body}>
          {FLOW_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text style={textStyles.smallCaps}>sources</Text>
        <Text selectable style={[body, styles.sectionBody]}>
          {SOURCES_BODY}
        </Text>
        {visibleSources.length > 0 && (
          <Text
            selectable
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              lineHeight: typography.sizeSm * typography.leadingBody,
              color: colors.textSecondary,
              marginTop: SPACING.sm,
            }}
          >
            Recent stories draw on {prose(visibleSources)}
            {extraCount > 0 ? `, and ${extraCount} others` : ''}.
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text style={textStyles.smallCaps}>context</Text>
        <Text selectable style={[body, styles.sectionBody]}>
          {CONTEXT_BODY}
        </Text>
        <HapticPressable
          onPress={() => setProvidersOpen((v) => !v)}
          style={styles.discloseToggle}
          accessibilityRole="button"
          accessibilityLabel={providersOpen ? 'Hide data providers' : 'View data providers'}
          accessibilityState={{ expanded: providersOpen }}
        >
          <Text
            style={{
              ...font.smallCaps,
              fontSize: typography.sizeXs,
              letterSpacing: typography.trackingCaps,
              color: colors.accent,
            }}
          >
            {providersOpen ? 'hide data providers' : 'view data providers'}
          </Text>
        </HapticPressable>
        {providersOpen && (
          <View style={styles.linkList}>
            {DATA_SOURCES.map((l, idx) => (
              <Animated.View
                key={l.url}
                entering={FadeInDown.duration(ANIMATION.fast).delay(staggerDelay(idx))}
              >
                <HapticPressable
                  onPress={() => openLink(l.url)}
                  style={styles.link}
                  accessibilityRole="link"
                  accessibilityLabel={l.label}
                >
                  <Text
                    style={{
                      ...font.semiBold,
                      fontSize: typography.sizeSm,
                      color: colors.accent,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {l.label}
                  </Text>
                </HapticPressable>
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text style={textStyles.smallCaps}>principles</Text>
        <View style={styles.principleList}>
          {PRINCIPLES.map((p, idx) => (
            <View key={p.term} style={idx > 0 ? styles.principle : undefined}>
              <Text
                selectable
                style={{
                  ...font.italic,
                  fontSize: typography.sizeBase,
                  lineHeight: typography.sizeBase * typography.leadingHeading,
                  color: colors.accent,
                }}
              >
                {p.term}
              </Text>
              <Text
                selectable
                style={{
                  ...body,
                  marginTop: SPACING.xxs,
                }}
              >
                {p.gloss}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: SPACING.md,
  },
  listBlock: {
    marginTop: SPACING.lg,
    gap: SPACING.xxs,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionBody: {
    marginTop: SPACING.xs,
  },
  linkList: {
    marginTop: SPACING.xs,
  },
  link: {
    marginTop: SPACING.xs,
  },
  discloseToggle: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
  },
  principleList: {
    marginTop: SPACING.sm,
  },
  principle: {
    marginTop: SPACING.md,
  },
  closer: {
    marginTop: SPACING.xl,
  },
});
