import type { WidgetEnvironment } from 'expo-widgets';
import { DARK_PAPER, LIGHT_PAPER, SPACING } from '../constants/paper';
import options from '../widgets/news-options.json';
import {
  NEWS_HOME,
  NEWS_SECTION_NAMES,
  NEWS_STALE_AFTER,
  type NewsConfiguration,
  type NewsWidgetProps,
} from './news-widget';

export interface NewsEnvironment extends WidgetEnvironment<NewsConfiguration> {
  widthDp?: number;
  heightDp?: number;
  fontScale?: number;
  largeText?: boolean;
  timestamp?: number;
  language?: string;
  editWidgetId?: number;
  brandMark?: string;
  preview?: boolean;
}

export const newsWidgetDesign = {
  ink: {
    light: {
      paper: LIGHT_PAPER.bg,
      title: LIGHT_PAPER.textEmphasis,
      accent: LIGHT_PAPER.accent,
      quiet: LIGHT_PAPER.textSecondary,
      rule: LIGHT_PAPER.rule,
    },
    dark: {
      paper: DARK_PAPER.sheetBg,
      title: DARK_PAPER.textEmphasis,
      accent: DARK_PAPER.accent,
      quiet: DARK_PAPER.textSecondary,
      rule: DARK_PAPER.rule,
    },
  },
  space: SPACING,
  size: {
    meta: 12,
    headline: 15,
    lead: 19,
    /** The single lead on a compact widget at standard text sizes. */
    compactLead: 22,
    brand: 15,
    mark: 26,
  },
  sectionNames: NEWS_SECTION_NAMES,
  arabicSections: Object.fromEntries(
    options.section.values.map(({ value, nameAr }) => [value, nameAr]),
  ),
  staleAfter: NEWS_STALE_AFTER,
  home: NEWS_HOME,
};

type Design = typeof newsWidgetDesign;

export function newsLayoutModel(p: NewsWidgetProps, env: NewsEnvironment, d: Design) {
  'widget';
  const config = env.configuration ?? {};
  const section =
    config.section && Object.hasOwn(d.sectionNames, config.section) ? config.section : 'latest';
  const followsSystem = !config.appearance || config.appearance === 'system';
  const dark = (followsSystem ? env.colorScheme : config.appearance) === 'dark';
  const now = env.timestamp ?? Date.now();
  const arabic = env.language === 'ar';
  const names = arabic ? d.arabicSections : d.sectionNames;
  const age = (published: number) => {
    const minutes = Math.max(0, Math.floor((now - published) / 60_000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return arabic ? 'الآن' : 'Now';
    if (minutes < 60) return arabic ? `${minutes} د` : `${minutes} min`;
    if (hours < 24) return arabic ? `${hours} س` : `${hours}h`;
    return arabic ? `${days} ي` : `${days}d`;
  };
  const status = p.offline
    ? arabic
      ? 'غير متصل'
      : 'Offline'
    : p.error
      ? p.generated === undefined
        ? arabic
          ? 'تعذّر التحديث'
          : 'Couldn’t refresh'
        : arabic
          ? 'أخبار محفوظة'
          : 'Saved news'
      : p.generated !== undefined && now - p.generated >= d.staleAfter
        ? arabic
          ? `آخر تحديث · ${age(p.generated)}`
          : `Updated ${age(p.generated)} ago`
        : '';
  const empty =
    p.generated !== undefined
      ? arabic
        ? 'لا أخبار في هذا القسم'
        : 'No stories in this section yet'
      : p.offline
        ? arabic
          ? 'اتصل بالإنترنت لتحميل الأخبار'
          : 'Connect to load headlines'
        : p.loading
          ? arabic
            ? 'جارٍ تحميل الأخبار'
            : 'Checking for headlines'
          : arabic
            ? 'افتح التطبيق لتحميل الأخبار'
            : 'Open zuhd.news to load headlines';
  const stories = (p.stories?.[section] ?? []).map((story) => {
    const sectionLabel = names[story.category];
    const ageLabel = age(story.published);
    return { ...story, sectionLabel, ageLabel, metadata: `${sectionLabel} · ${ageLabel}` };
  });
  const w = env.widthDp ?? 300;
  const h = env.heightDp ?? 160;
  const scale = Math.min(env.fontScale ?? 1, 1.85);
  const small = w < 235;
  const large = !small && h >= 260;
  const inset = small ? d.space.smPlus : d.space.md;
  const header = scale > 1.4 ? 45 : 38;
  const meta = Math.ceil((d.size.meta + (arabic ? 9 : 5)) * scale);
  const statusHeight = (small || env.editWidgetId) && status ? meta : 0;
  const body = Math.max(1, h - header - 2 * d.space.sm - statusHeight);
  const bonus = small ? 0 : large ? 30 : 12;
  const capacity = Math.floor((body - bonus) / Math.ceil(41 * scale));
  const count = small ? 1 : Math.max(1, Math.min(stories.length, large ? 6 : 3, capacity));
  const row = Math.floor((body - bonus) / count);
  const lead = row + bonus;
  const splitMetadata = small && scale > 1.4;
  const metadataHeight = splitMetadata ? 2 * meta : meta;
  const compactHeadline = scale <= 1.4 ? d.size.compactLead : d.size.lead;
  // Android's Arabic fallback has a deeper ascent and descent than the Latin face.
  const headlineLine = (size: number, title: string) =>
    (size + 4 + (/\p{Script=Arabic}/u.test(title) ? size * 0.65 : 0)) * scale;
  const compactLine = headlineLine(compactHeadline, stories[0]?.title ?? '');
  const mapBudget = body - meta - d.space.sm - 4;
  // Prefer four lines when a map still fits. Three is the minimum.
  const mapRoom = Math.max(mapBudget - Math.ceil(4 * compactLine), d.space.lg);
  const compactMapHeight =
    small && config.images !== false && stories[0]?.image && scale <= 1.4
      ? Math.min(Math.round((w - 2 * inset) * 0.3), mapRoom, mapBudget - Math.ceil(3 * compactLine))
      : 0;
  const compactMap = compactMapHeight >= d.space.lg ? compactMapHeight : 0;
  const hasMetadata = (height: number, size: number, title: string) =>
    height >=
    metadataHeight + Math.ceil(Math.max((d.size.lead + 6) * scale, headlineLine(size, title)));
  const lines = (height: number, size: number, withMetadata: boolean, title: string) =>
    Math.max(
      1,
      Math.min(
        small ? 4 : 2,
        Math.floor((height - (withMetadata ? metadataHeight : 0) - 4) / headlineLine(size, title)),
      ),
    );
  return {
    dark,
    followsSystem,
    edit: arabic ? 'تعديل' : 'Edit',
    colors: d.ink[dark ? 'dark' : 'light'],
    sectionName: names[section],
    status,
    empty,
    maps: config.images !== false,
    stories,
    android: {
      small,
      large,
      inset,
      inner: w - 2 * inset,
      header,
      statusHeight,
      count,
      row,
      lead,
      scale,
      hasMetadata,
      splitMetadata,
      lines,
      compactHeadline,
      compactMap,
    },
  };
}
