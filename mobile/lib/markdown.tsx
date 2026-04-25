import type { Entity } from '@shared/types';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, type TextStyle } from 'react-native';
import { ANDROID_TEXT_BASE } from '../constants/platform';
import {
  type ColorPalette,
  type FontSet,
  INLINE_HIT_SLOP,
  MAX_FONT_SCALE,
  type Typography,
} from '../constants/theme';

export type Segment = {
  type: 'text' | 'bold' | 'italic' | 'boldItalic' | 'link' | 'entity';
  text: string;
  url?: string;
  /** When type === 'entity', the resolved entity for the tappable run. */
  entity?: Entity;
};

export type EntityPressHandler = (entity: Entity) => void;

export type LinkOpener = (url: string) => void;

const defaultOpenLink: LinkOpener = (url) => {
  Linking.openURL(url).catch(() => {});
};

export function smartTypography(s: string): string {
  return s
    .replace(/(\s|^)"(\S)/g, '$1\u201c$2') // opening double quote
    .replace(/"/g, '\u201d') // closing double quote
    .replace(/(\s|^)'(\S)/g, '$1\u2018$2') // opening single quote
    .replace(/'/g, '\u2019') // closing single quote / apostrophe
    .replace(/---/g, '\u2014') // em dash
    .replace(/--/g, '\u2013') // en dash
    .replace(/\.\.\./g, '\u2026') // ellipsis
    .replace(/\b1\/4\b/g, '\u00BC') // ¼
    .replace(/\b1\/2\b/g, '\u00BD') // ½
    .replace(/\b3\/4\b/g, '\u00BE') // ¾
    .replace(/\b1\/3\b/g, '\u2153') // ⅓
    .replace(/\b2\/3\b/g, '\u2154'); // ⅔
}

export function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;

  for (const match of line.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ type: 'text', text: smartTypography(line.slice(lastIndex, idx)) });
    }
    if (match[1]) {
      // Parse nested italic (*...*) within bold content
      const boldContent = match[1];
      const italicRe = /\*(.+?)\*/g;
      let bLast = 0;
      let hasNested = false;
      for (const im of boldContent.matchAll(italicRe)) {
        hasNested = true;
        const imIdx = im.index ?? 0;
        if (imIdx > bLast)
          segments.push({
            type: 'bold',
            text: smartTypography(boldContent.slice(bLast, imIdx)),
          });
        segments.push({ type: 'boldItalic', text: smartTypography(im[1] ?? '') });
        bLast = imIdx + im[0].length;
      }
      if (!hasNested) {
        segments.push({ type: 'bold', text: smartTypography(boldContent) });
      } else if (bLast < boldContent.length) {
        segments.push({ type: 'bold', text: smartTypography(boldContent.slice(bLast)) });
      }
    } else if (match[2]) segments.push({ type: 'italic', text: smartTypography(match[2]) });
    else if (match[3])
      segments.push({ type: 'link', text: smartTypography(match[3]), url: match[4] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < line.length) {
    segments.push({ type: 'text', text: smartTypography(line.slice(lastIndex)) });
  }
  return segments.length ? segments : [{ type: 'text', text: smartTypography(line) }];
}

/** Split plain-text segments on any entity mentions, in-place, preserving
 *  surrounding text. Matches the mention string with a case-insensitive,
 *  word-boundary regex (+ optional plural 's'). First occurrence per entity
 *  per sentence wins — dedup happens via the outer pass. Non-text segments
 *  (bold, italic, link) pass through unchanged so an emphasised mention
 *  stays emphasised rather than flipping to accent. */
export function splitSegmentsWithEntities(segments: Segment[], entities: Entity[]): Segment[] {
  if (!entities.length) return segments;
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.type !== 'text') {
      out.push(seg);
      continue;
    }
    const text = seg.text;
    // Find all entity matches in this text run, earliest-first; walk once.
    type Hit = { start: number; end: number; entity: Entity };
    const hits: Hit[] = [];
    for (const e of entities) {
      const escaped = e.mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}(?:s)?\\b`, 'i');
      const m = re.exec(text);
      if (m && m.index != null) {
        hits.push({ start: m.index, end: m.index + m[0].length, entity: e });
      }
    }
    hits.sort((a, b) => a.start - b.start);
    // Drop overlaps — keep the earliest match.
    const cleaned: Hit[] = [];
    let lastEnd = -1;
    for (const h of hits) {
      if (h.start >= lastEnd) {
        cleaned.push(h);
        lastEnd = h.end;
      }
    }
    if (cleaned.length === 0) {
      out.push(seg);
      continue;
    }
    // Build the new segment list for this text run.
    let pos = 0;
    for (const h of cleaned) {
      if (h.start > pos) {
        out.push({ type: 'text', text: text.slice(pos, h.start) });
      }
      out.push({ type: 'entity', text: text.slice(h.start, h.end), entity: h.entity });
      pos = h.end;
    }
    if (pos < text.length) {
      out.push({ type: 'text', text: text.slice(pos) });
    }
  }
  return out;
}

export interface MarkdownStyles {
  sentence: TextStyle;
  bold: TextStyle;
  italic: TextStyle;
  boldItalic: TextStyle;
  link: TextStyle;
  /** Inline country-mention links — `[Iran](country:IR)`. Styled as a quiet
   *  reference (text color + dim dotted underline) so they read as semantic
   *  enrichment in the prose, not hyperlinks competing for attention. Tap
   *  dispatches to the same openLink callback; callers intercept the
   *  `country:` scheme before hitting Linking. */
  countryLink: TextStyle;
  entity: TextStyle;
  dateline: TextStyle;
}

/** URL scheme for tappable country mentions in article markdown.
 *  Writers emit `[Label](country:XX)` where XX is an ISO-3166 alpha-2 code.
 *  ArticlePage / ContextSheet intercept the scheme in their openLink wrappers
 *  and open `CountrySheet` instead of routing to the OS browser. */
export const COUNTRY_URL_SCHEME = 'country:';

export function makeMarkdownStyles(
  colors: ColorPalette,
  font: FontSet,
  typography: Typography,
): MarkdownStyles {
  return StyleSheet.create({
    sentence: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      color: colors.text,
      marginBottom: typography.sizeBase * 0.5,
      fontVariant: ['oldstyle-nums'],
    },
    bold: {
      ...font.bold,
    },
    italic: {
      ...font.italic,
    },
    boldItalic: {
      ...font.boldItalic,
    },
    link: {
      color: colors.accent,
      textDecorationLine: 'underline',
    },
    // Country mentions: accent-tinted text, no underline. Shares the
    // "tappable rich noun" affordance with the entity treatment — readers
    // learn that any accent-colored word in prose opens a data sheet.
    // Avoids the platform-underline problem where `textDecorationLine`
    // sits tight against letter baselines and can't be nudged lower
    // (RN doesn't expose `text-underline-offset`).
    countryLink: {
      color: colors.accent,
    },
    // Entity runs get the accent hue without underline — a softer affordance
    // than a link so that tappable rich nouns don't compete with inline URLs.
    // The tap target uses RN Text's onPress; readers discover via color.
    entity: {
      color: colors.accent,
    },
    dateline: {
      ...font.smallCaps,
    },
  });
}

export function renderSegments(
  segments: Segment[],
  mdStyles: MarkdownStyles,
  openLink: LinkOpener,
  onEntityPress?: EntityPressHandler,
): ReactNode[] {
  return segments.map((seg, j) => {
    switch (seg.type) {
      case 'bold':
        return (
          <Text key={j} style={mdStyles.bold}>
            {seg.text}
          </Text>
        );
      case 'italic':
        return (
          <Text key={j} style={mdStyles.italic}>
            {seg.text}
          </Text>
        );
      case 'boldItalic':
        return (
          <Text key={j} style={mdStyles.boldItalic}>
            {seg.text}
          </Text>
        );
      case 'link': {
        const isCountry = seg.url?.startsWith(COUNTRY_URL_SCHEME);
        return (
          <Text
            key={j}
            style={isCountry ? mdStyles.countryLink : mdStyles.link}
            onPress={() => seg.url && openLink(seg.url)}
            // @ts-expect-error — `hitSlop` on inline Text with onPress expands the tap target at runtime (RN docs) but isn't surfaced on TextProps
            hitSlop={INLINE_HIT_SLOP}
          >
            {seg.text}
          </Text>
        );
      }
      case 'entity': {
        const entity = seg.entity;
        const onPress = entity && onEntityPress ? () => onEntityPress(entity) : undefined;
        return (
          <Text
            key={j}
            style={mdStyles.entity}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${seg.text} — tap for live data`}
            // @ts-expect-error — see note on `link` case above
            hitSlop={INLINE_HIT_SLOP}
          >
            {seg.text}
          </Text>
        );
      }
      default:
        return seg.text;
    }
  });
}

export function renderSentences(
  sentences: string[],
  mdStyles: MarkdownStyles,
  typography: Typography,
  fontSize?: number,
  location?: string | null,
  dateline?: string | null,
  openLink: LinkOpener = defaultOpenLink,
  /** Optional inline node appended after the last word of the final sentence —
   *  used by ArticlePage to append a tappable "sources" link without costing
   *  a new line of vertical space. */
  trailing?: ReactNode,
  /** If provided, the inline dateline becomes tappable (e.g. to reveal the
   *  exact timestamp in a toast). */
  onDatelinePress?: () => void,
  /** Tappable rich-noun mentions in the body — each one's first occurrence
   *  across the sentence list becomes a tappable `<Text>` with `onEntityPress`. */
  entities?: Entity[],
  onEntityPress?: EntityPressHandler,
): ReactNode[] {
  const size = fontSize ?? typography.sizeBase;
  const sizeStyle = fontSize
    ? {
        fontSize: size,
        lineHeight: size * typography.leadingBody,
        marginBottom: size * 0.5,
      }
    : null;

  const lastIdx = sentences.length - 1;

  // Entities fire on first occurrence only across the whole body — track
  // which indicator ids have already been consumed so later sentences don't
  // double-tag them. Mutates per render but local to this call.
  const remaining = entities ? [...entities] : [];
  const consume = (rendered: Segment[]): Entity[] => {
    if (!remaining.length) return [];
    const used: Entity[] = [];
    // Take whichever of the remaining entities match anywhere in the
    // current sentence's plain-text segments; drop them from `remaining`.
    const plain = rendered
      .filter((s) => s.type === 'text')
      .map((s) => s.text)
      .join(' ');
    const next: Entity[] = [];
    for (const e of remaining) {
      const escaped = e.mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}(?:s)?\\b`, 'i');
      if (re.test(plain)) used.push(e);
      else next.push(e);
    }
    remaining.length = 0;
    remaining.push(...next);
    return used;
  };

  return sentences.map((sentence, i) => {
    const isLast = i === lastIdx;
    if (i === 0) {
      // Strip "Location — " prefix from first sentence if present
      let rest = sentence;
      if (location) {
        const prefix = `${location} \u2014 `;
        if (sentence.startsWith(prefix)) rest = sentence.slice(prefix.length);
      }
      const baseSegments = parseInline(rest);
      const segmentsForRender = entities?.length
        ? splitSegmentsWithEntities(baseSegments, consume(baseSegments))
        : baseSegments;
      // Show dateline (e.g. time ago) in small-caps before first sentence.
      if (dateline) {
        return (
          <Text
            key={i}
            style={[mdStyles.sentence, sizeStyle]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.body}
          >
            <Text style={mdStyles.dateline} onPress={onDatelinePress}>
              {dateline}
            </Text>
            {'\u2002'}
            {renderSegments(segmentsForRender, mdStyles, openLink, onEntityPress)}
            {isLast && trailing}
          </Text>
        );
      }
      return (
        <Text
          key={i}
          style={[mdStyles.sentence, sizeStyle]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {renderSegments(segmentsForRender, mdStyles, openLink, onEntityPress)}
          {isLast && trailing}
        </Text>
      );
    }
    const baseSegments = parseInline(sentence);
    const segmentsForRender = entities?.length
      ? splitSegmentsWithEntities(baseSegments, consume(baseSegments))
      : baseSegments;
    return (
      <Text
        key={i}
        style={[mdStyles.sentence, sizeStyle]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.body}
      >
        {renderSegments(segmentsForRender, mdStyles, openLink, onEntityPress)}
        {isLast && trailing}
      </Text>
    );
  });
}
