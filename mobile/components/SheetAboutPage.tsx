import type { Article } from '@shared/types';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ANIMATION, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import { makeStaggerEnter, staggerEnter } from '../lib/stagger';
import { MenuRow, SectionLabel } from './MenuRow';
import { Icon, Text } from './primitives';
import { SheetLink } from './SheetContent';

// Copy lives with the component; the About page is one-of-a-kind and doesn't
// reuse the generic InfoSection schema.

const LEAD = 'Zuhd \u2014 the discipline of doing without what you do not need.';

const MANIFESTO = [
  'Information is no longer scarce; attention is. Nothing becomes a shared fact until enough people stop to look at it \u2014 and without shared facts there is nothing left to trust.',
  'In 1971, Herbert Simon observed that a wealth of information creates a poverty of attention. Six centuries earlier, Ibn Taymiyyah had named the discipline \u2014 zuhd: abandon what does not bring benefit. zuhd.news applies that discipline to the present.',
  'Most systems that process news are optimized for engagement rather than understanding. This one runs on the principles below. The work is automated; the judgment is not.',
];

// The writer's blocks (`scripts/write-prompt.md` §rhythm): hook, why it
// matters, mechanism, what's next. The mechanism was missing from this list
// until 2026-09-25. The optional fifth block — a counterpoint or a named
// person's words — is earned per story, so the list of what every story says
// leaves it out.
const WHATS = [
  'What happened.',
  'Why it matters.',
  'How it works.',
  'What comes next.',
  'Then stop.',
];

const STANCE =
  'Where a story is told from determines who is treated as a person and who as a statistic. People who bear power\u2019s consequences are the subject, not the background.';

const SUBTRACTIONS = [
  'No ads.',
  'No tracking.',
  'No profile.',
  'No investors.',
  'No social login.',
  'No algorithmic feed.',
];

// The positive form of the list above, and the strongest true claim the app
// has: not a promise about what we choose not to do, but a statement about
// what we are unable to do. No accounts exist, no identifier is sent with a
// content request, and a push goes out as one broadcast to every registered
// token — so there is no seam along which readers could be told apart even
// if someone wanted to. The privacy page and the store listing use the same
// sentence; if it changes, change it in all three.
//
// Scoped to the news server since 2026-09-25. It said "we have no way to tell
// readers apart", but the app's update check sends a random per-install ID to
// the update service at every launch (expo-updates' `EAS-Client-ID`), which
// the privacy page now says in plain words.
const NO_PROFILE_LINE =
  'There are no accounts. The app sends no identifier when it fetches the news, so the news server cannot tell readers apart.';

const NEWSROOM_LINE =
  'zuhd.news is an automated newsroom. The editors do not write the articles; they write the rules the newsroom follows \u2014 what qualifies as news, how a claim is verified, whether a pattern is oppression, when to name power.';

const FLOW_LINE =
  'Under those rules, the newsroom reads the world, verifies what it finds, drafts each article, and augments it with live data.';

const SOURCES_BODY =
  'There is no fixed roster. Each cycle, the newsroom looks for the voices closest to the story \u2014 from international wires like Reuters and the BBC to newsrooms inside the country where it happened. Where other coverage exists, no more than two of a story\u2019s sources come from the Western press. State media is included to carry a government\u2019s position, never as a substitute for independent reporting.';

// Not "every article": most carry no indicator (write-prompt.md). The live
// maps were missing from this sentence until 2026-09-25.
const CONTEXT_BODY =
  'Around the stories sits a layer of live and institutional data: shipping through the straits, markets and currencies, development and press-freedom indicators, refugee counts, prediction markets, and maps of disasters, conflict, hunger, fires and genocide findings.';

// Name and address apart, so the list reads as a list: joined by a dash and
// underlined, twelve of them wrapped into a block of links (2026-09-25).
// Every provider whose data the app shows, roughly in the order a reader meets
// them: the globe's layers, then markets, then the country figures. Nine were
// missing until 2026-09-25 — every map layer, the exchanges, crypto and the
// sea state among them. OWID, V-Dem, TI, RSF, UNDP, UNHCR and REST Countries
// are frozen snapshots in `shared/countries/`, but the app still shows them.
const DATA_SOURCES: { name: string; domain: string; url: string }[] = [
  { name: 'GDACS, UN and European Commission', domain: 'gdacs.org', url: 'https://www.gdacs.org/' },
  { name: 'Uppsala Conflict Data Program', domain: 'ucdp.uu.se', url: 'https://ucdp.uu.se/' },
  { name: 'IPC and Cadre Harmonisé', domain: 'ipcinfo.org', url: 'https://www.ipcinfo.org/' },
  {
    name: 'NASA FIRMS',
    domain: 'firms.modaps.eosdis.nasa.gov',
    url: 'https://firms.modaps.eosdis.nasa.gov/',
  },
  { name: 'UN human rights investigations', domain: 'ohchr.org', url: 'https://www.ohchr.org/' },
  { name: 'IMF PortWatch', domain: 'portwatch.imf.org', url: 'https://portwatch.imf.org/' },
  { name: 'Open-Meteo', domain: 'open-meteo.com', url: 'https://open-meteo.com/' },
  { name: 'Yahoo Finance', domain: 'finance.yahoo.com', url: 'https://finance.yahoo.com/' },
  {
    name: 'Open Exchange Rates',
    domain: 'openexchangerates.org',
    url: 'https://openexchangerates.org/',
  },
  { name: 'CoinGecko', domain: 'coingecko.com', url: 'https://www.coingecko.com/' },
  { name: 'FRED', domain: 'fred.stlouisfed.org', url: 'https://fred.stlouisfed.org/' },
  { name: 'Polymarket', domain: 'polymarket.com', url: 'https://polymarket.com/' },
  { name: 'World Bank', domain: 'data.worldbank.org', url: 'https://data.worldbank.org/' },
  {
    name: 'Harvard Growth Lab',
    domain: 'atlas.hks.harvard.edu',
    url: 'https://atlas.hks.harvard.edu/',
  },
  { name: 'Our World in Data', domain: 'ourworldindata.org', url: 'https://ourworldindata.org/' },
  { name: 'V-Dem Institute', domain: 'v-dem.net', url: 'https://v-dem.net/' },
  {
    name: 'Transparency International',
    domain: 'transparency.org',
    url: 'https://www.transparency.org/en/cpi',
  },
  { name: 'Reporters Without Borders', domain: 'rsf.org', url: 'https://rsf.org/en/index' },
  { name: 'UNDP Human Development', domain: 'hdr.undp.org', url: 'https://hdr.undp.org/' },
  {
    name: 'UNHCR Refugee Data',
    domain: 'unhcr.org',
    url: 'https://www.unhcr.org/refugee-statistics/',
  },
  { name: 'REST Countries', domain: 'restcountries.com', url: 'https://restcountries.com/' },
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
  /** The app's version, printed in the colophon — its one place in the menu. */
  version: string;
}

/**
 * One essay, then the facts under headings. It was seven paragraphs before the
 * first heading, with the format's four beats and the six things the app does
 * without set as 13pt grey captions between them — the page's strongest lines
 * as its fine print. The headings are the `labelSm` the privacy page uses, so
 * the two pages read as one voice.
 */
export function SheetAboutPage({ articles, version }: SheetAboutPageProps) {
  const { colors } = useTheme();
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

      <Animated.View entering={enter()}>
        <SectionLabel label="every story" />
        <View style={styles.list}>
          {WHATS.map((item) => (
            <Text key={item} selectable variant="body">
              {item}
            </Text>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="whose story" />
        <Text selectable variant="body">
          {STANCE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="left out" />
        <View style={styles.list}>
          {SUBTRACTIONS.map((item) => (
            <Text key={item} selectable variant="body">
              {item}
            </Text>
          ))}
        </View>
        <Text selectable variant="body" style={styles.block}>
          {NO_PROFILE_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="the newsroom" />
        <Text selectable variant="body">
          {NEWSROOM_LINE}
        </Text>
        <Text selectable variant="body" style={styles.block}>
          {FLOW_LINE}
        </Text>
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="sources" />
        <Text selectable variant="body">
          {SOURCES_BODY}
        </Text>
        {visibleSources.length > 0 && (
          <Text selectable variant="caption" style={styles.aside}>
            {/* With extras the "and" belongs before "N others", so the visible
                list joins with plain commas instead of prose()'s ", and". */}
            {extraCount > 0
              ? `Recent stories draw on ${visibleSources.join(', ')}, and ${extraCount} others.`
              : `Recent stories draw on ${prose(visibleSources)}.`}
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="context" />
        <Text selectable variant="body">
          {CONTEXT_BODY}
        </Text>
        {/* A row, where it was an 11pt caps line in accent grey that did not
            look pressable; open, each provider is a row of its own. */}
        <View style={[styles.providers, { borderTopColor: colors.rule }]}>
          <MenuRow
            first
            title="data providers"
            description={`${DATA_SOURCES.length} institutions and services`}
            trailing={
              <Icon
                name={providersOpen ? 'chevron-up' : 'chevron-down'}
                size="sm"
                tone="secondary"
              />
            }
            accessibilityState={{ expanded: providersOpen }}
            onPress={() => setProvidersOpen((v) => !v)}
          />
          {providersOpen &&
            DATA_SOURCES.map((l, idx) => (
              <Animated.View key={l.url} entering={staggerEnter(idx, ANIMATION.fast)}>
                <MenuRow
                  title={l.name}
                  description={l.domain}
                  trailing="leave"
                  accessibilityRole="link"
                  onPress={() => openLink(l.url)}
                />
              </Animated.View>
            ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="principles" />
        {PRINCIPLES.map((p, idx) => (
          <View key={p.term} style={idx > 0 ? styles.principle : undefined}>
            <Text selectable variant="bodyItalic" tone="accent">
              {p.term}
            </Text>
            <Text selectable variant="body" style={styles.gloss}>
              {p.gloss}
            </Text>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={enter()}>
        <SectionLabel label="colophon" />
        <SheetLink label={MAKER_BYLINE} onPress={() => openLink(MAKER_PROJECTS)} />
        {version ? (
          <Text selectable variant="caption" style={styles.aside}>
            version {version}
          </Text>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // The sheet's two tiers: `md` between paragraphs of one thought; `lg`
  // before a heading, which `SectionLabel` carries.
  block: {
    marginTop: SPACING.md,
  },
  list: {
    gap: SPACING.xxs,
  },
  aside: {
    marginTop: SPACING.sm,
  },
  providers: {
    marginTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  principle: {
    marginTop: SPACING.md,
  },
  gloss: {
    marginTop: SPACING.xxs,
  },
});
