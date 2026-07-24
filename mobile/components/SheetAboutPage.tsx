import type { Article } from '@shared/types';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ANIMATION, SPACING } from '../constants/theme';
import { useOpenLink } from '../lib/open-link';
import { makeStaggerEnter, staggerEnter } from '../lib/stagger';
import { Pressable, Text } from './primitives';
import { SheetLink } from './SheetContent';

// Copy lives with the component; the About page is one-of-a-kind and doesn't
// reuse the generic InfoSection schema.

const LEAD = 'Zuhd \u2014 the discipline of doing without what you do not need.';

const MANIFESTO = [
  'Information is no longer scarce; attention is. Nothing becomes a shared fact until enough people stop to look at it \u2014 and without shared facts there is nothing left to trust.',
  'In 1971, Herbert Simon observed that a wealth of information creates a poverty of attention. Six centuries earlier, Ibn Taymiyyah had named the discipline \u2014 zuhd: abandon what does not bring benefit. zuhd.news applies that discipline to the present.',
  'Most systems that process news are optimized for engagement rather than understanding. This one runs on the principles below. The work is automated; the judgment is not.',
];

const WHATS = ['What happened.', 'Why it matters.', 'What comes next.', 'Then stop.'];

const STANCE =
  'Where a story is told from determines who is treated as a person and who as a statistic. People who bear power\u2019s consequences are the subject, not the background.';

const SUBTRACTIONS = [
  'No ads.',
  'No tracking.',
  'No investors.',
  'No social login.',
  'No algorithmic feed.',
];

const NEWSROOM_LINE =
  'zuhd.news is an automated newsroom. The editors do not write the articles; they write the rules the newsroom follows \u2014 what qualifies as news, how a claim is verified, whether a pattern is oppression, when to name power.';

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

// The colophon in content/about.md ("created by Yunus Andreasson") is dropped
// by the hand-maintained copy above; re-add the maker credit here as a single
// quiet byline. It links to the maker's projects page, which lists his other
// work \u2014 so this app doesn't carry a socials/other-apps billboard of its own.
const MAKER_PROJECTS = 'https://andreassonphoto.com/projects';
const MAKER_BYLINE = 'Made by Yunus Andreasson';

const SUPPRESS_SOURCES = new Set(['Hacker News']);

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

export function SheetAboutPage({ articles }: SheetAboutPageProps) {
  const openLink = useOpenLink();
  const [providersOpen, setProvidersOpen] = useState(false);

  const recentSources = useMemo(() => aggregateSources(articles), [articles]);
  const visibleSources = recentSources.slice(0, 10);
  const extraCount = Math.max(0, recentSources.length - visibleSources.length);

  const enter = makeStaggerEnter();

  return (
    <>
      <Animated.View entering={enter()}>
        <Text selectable variant="lead">
          {LEAD}
        </Text>
      </Animated.View>

      {MANIFESTO.map((line) => (
        <Animated.View key={line} entering={enter()} style={styles.block}>
          <Text selectable variant="body">
            {line}
          </Text>
        </Animated.View>
      ))}

      <Animated.View entering={enter()} style={styles.listBlock}>
        {WHATS.map((item) => (
          <Text key={item} selectable variant="caption">
            {item}
          </Text>
        ))}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable variant="body">
          {STANCE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.listBlock}>
        {SUBTRACTIONS.map((item) => (
          <Text key={item} selectable variant="caption">
            {item}
          </Text>
        ))}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable variant="body">
          {NEWSROOM_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.block}>
        <Text selectable variant="body">
          {FLOW_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text variant="labelSm">sources</Text>
        <Text selectable variant="body" style={styles.sectionBody}>
          {SOURCES_BODY}
        </Text>
        {visibleSources.length > 0 && (
          <Text selectable variant="caption" style={{ marginTop: SPACING.sm }}>
            {/* With extras the "and" belongs before "N others", so the visible
                list joins with plain commas instead of prose()'s ", and". */}
            {extraCount > 0
              ? `Recent stories draw on ${visibleSources.join(', ')}, and ${extraCount} others.`
              : `Recent stories draw on ${prose(visibleSources)}.`}
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text variant="labelSm">context</Text>
        <Text selectable variant="body" style={styles.sectionBody}>
          {CONTEXT_BODY}
        </Text>
        <Pressable
          onPress={() => setProvidersOpen((v) => !v)}
          style={styles.discloseToggle}
          accessibilityRole="button"
          accessibilityLabel={providersOpen ? 'Hide data providers' : 'View data providers'}
          accessibilityState={{ expanded: providersOpen }}
        >
          <Text variant="labelXs" tone="accent">
            {providersOpen ? 'hide data providers' : 'view data providers'}
          </Text>
        </Pressable>
        {providersOpen && (
          <View style={styles.linkList}>
            {DATA_SOURCES.map((l, idx) => (
              <Animated.View key={l.url} entering={staggerEnter(idx, ANIMATION.fast)}>
                <SheetLink label={l.label} onPress={() => openLink(l.url)} />
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text variant="labelSm">principles</Text>
        <View style={styles.principleList}>
          {PRINCIPLES.map((p, idx) => (
            <View key={p.term} style={idx > 0 ? styles.principle : undefined}>
              <Text selectable variant="bodyItalic" tone="accent">
                {p.term}
              </Text>
              <Text selectable variant="body" style={{ marginTop: SPACING.xxs }}>
                {p.gloss}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter()} style={styles.section}>
        <Text variant="labelSm">colophon</Text>
        <SheetLink label={MAKER_BYLINE} onPress={() => openLink(MAKER_PROJECTS)} />
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
});
