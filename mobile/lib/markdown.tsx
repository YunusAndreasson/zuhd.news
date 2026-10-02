import type { Entity } from '@shared/types';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { ANDROID_TEXT_BASE } from '../constants/platform';
import {
  ARTICLE_BREAK_PROPS,
  type ColorPalette,
  type FontSet,
  INLINE_HIT_SLOP,
  MAX_FONT_SCALE,
  type Typography,
} from '../constants/theme';
import { openExternal } from './open-link';

/** Article sentences are raw RN `Text` (not the `<Text variant>` primitive),
 *  so the body-role breaking props ride along here: Android dictionary
 *  hyphenation + the high-quality break strategy + the body Dynamic Type
 *  ramp. `StoryCard` used to set these on a wrapper it put around the whole
 *  run; now that every block is its own `Text`, the wrapper is gone and the
 *  props belong on the block. */
/** A body paragraph's break behaviour. `ARTICLE_BREAK_PROPS` rather than the
 *  conservative `PROSE_BREAK_PROPS`, because these are the article's own
 *  paragraphs and its column is narrow: dictionary word-breaks and the
 *  high-quality break strategy are what keep a 4-line block from ragging to 5. */
const SENTENCE_TEXT_PROPS = { ...ARTICLE_BREAK_PROPS, dynamicTypeRamp: 'body' } as const;

export type Segment = {
  type: 'text' | 'bold' | 'italic' | 'boldItalic' | 'link' | 'entity';
  text: string;
  url?: string;
  /** When type === 'entity', the resolved entity for the tappable run. */
  entity?: Entity;
};

export type EntityPressHandler = (entity: Entity) => void;

export type LinkOpener = (url: string) => void;

const defaultOpenLink: LinkOpener = openExternal;

/** The end of a word: what a quote that follows it closes. */
const WORD_END = /[\p{L}\p{N})\]}\u2019\u201d.,!?%]/u;

/**
 * `before` is the visible character the run follows on its line — the end of
 * a link or an emphasis. A quote at the start of a run opens only at a real
 * boundary: after a word it is an apostrophe or a closing quote. The rules
 * below read the start of every run as the start of a line, so every
 * possessive after a country link, `[China](country:CN)'s`, printed
 * `China‘s`.
 */
export function smartTypography(s: string, before = ''): string {
  const t = WORD_END.test(before) ? s.replace(/^'/, '\u2019').replace(/^"/, '\u201d') : s;
  return (
    t
      .replace(/(\s|^)"(\S)/g, '$1\u201c$2') // opening double quote
      .replace(/"/g, '\u201d') // closing double quote
      .replace(/(\s|^)'(\S)/g, '$1\u2018$2') // opening single quote
      .replace(/'/g, '\u2019') // closing single quote / apostrophe
      .replace(/---/g, '\u2014') // em dash
      .replace(/--/g, '\u2013') // en dash
      .replace(/\.\.\./g, '\u2026') // ellipsis
      // Break opportunity after en/em dashes that aren't already surrounded
      // by whitespace (e.g. `EU\u2013Russia`, `mid\u20131990s`). RN's line-breaker
      // doesn't treat \u2013/\u2014 as soft breaks, so without this an unspaced
      // dash glues both sides into a single unbreakable token and the tail
      // bleeds past the column at narrow widths. ZWSP is invisible and only
      // acts when the word would otherwise overflow.
      .replace(/([\u2013\u2014])(\S)/g, '$1\u200b$2')
      // And never before a spaced one: the space before it does not break,
      // so a line never starts with a dash (the `Text` primitive does the
      // same for strings that do not pass through here).
      .replace(/ ([\u2013\u2014])/g, '\u00a0$1')
      .replace(/\b1\/4\b/g, '\u00BC') // ¼
      .replace(/\b1\/2\b/g, '\u00BD') // ½
      .replace(/\b3\/4\b/g, '\u00BE') // ¾
      .replace(/\b1\/3\b/g, '\u2153') // ⅓
      .replace(/\b2\/3\b/g, '\u2154')
  ); // ⅔
}

/** Strip any unpaired markdown emphasis markers from a literal text run.
 *  `parseInline` only matches balanced pairs; anything that survives to
 *  here is an unbalanced marker (most often from an LLM-emitted bullet
 *  list, a single `*` footnote marker, or a writer's italic spanning a
 *  sentence boundary since we parse per-sentence). `\*+` catches single
 *  `*`, `**`, `***`. Underscores stay in single form because file paths
 *  and identifiers legitimately contain them; only paired `__` is
 *  stripped, parallel to `**`. Without this scrub the literal markers
 *  render visible to the reader. */
function stripStrayEmphasis(text: string): string {
  return text.replace(/\*+|__/g, '');
}

export function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  // Each run's typography, in the context of the run before it.
  const smart = (text: string) => smartTypography(text, segments.at(-1)?.text.slice(-1));

  for (const match of line.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({
        type: 'text',
        text: smart(stripStrayEmphasis(line.slice(lastIndex, idx))),
      });
    }
    if (match[1]) {
      // Parse nested italic (*...*) within bold content. Stray asterisks
      // that fall outside the nested italic pair (e.g. `**foo*bar**`)
      // are scrubbed via stripStrayEmphasis on each emitted bold slice;
      // the boldItalic content itself is already a balanced match.
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
            text: smart(stripStrayEmphasis(boldContent.slice(bLast, imIdx))),
          });
        segments.push({ type: 'boldItalic', text: smart(im[1] ?? '') });
        bLast = imIdx + im[0].length;
      }
      if (!hasNested) {
        segments.push({ type: 'bold', text: smart(stripStrayEmphasis(boldContent)) });
      } else if (bLast < boldContent.length) {
        segments.push({
          type: 'bold',
          text: smart(stripStrayEmphasis(boldContent.slice(bLast))),
        });
      }
    } else if (match[2])
      segments.push({ type: 'italic', text: smart(stripStrayEmphasis(match[2])) });
    else if (match[3]) segments.push({ type: 'link', text: smart(match[3]), url: match[4] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < line.length) {
    segments.push({
      type: 'text',
      text: smart(stripStrayEmphasis(line.slice(lastIndex))),
    });
  }
  return segments.length ? segments : [{ type: 'text', text: smart(stripStrayEmphasis(line)) }];
}

/** Each mention's pattern: case-insensitive, on word boundaries, with an
 *  optional plural `s`. Compiled once per mention, not once per sentence for
 *  each of the two passes that look for it. No `g` flag, so a shared pattern
 *  keeps no `lastIndex` between uses. */
const mentionPatterns = new Map<string, RegExp>();

function mentionPattern(mention: string): RegExp {
  let re = mentionPatterns.get(mention);
  if (!re) {
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}(?:s)?\\b`, 'i');
    mentionPatterns.set(mention, re);
  }
  return re;
}

/** Split plain-text segments on any entity mentions, in-place, preserving
 *  surrounding text. Matches the mention string with a case-insensitive,
 *  word-boundary regex (+ optional plural 's'). First occurrence per entity
 *  per sentence wins — dedup happens via the outer pass. Non-text segments
 *  (bold, italic, link) pass through unchanged so an emphasised mention
 *  stays emphasised rather than flipping to accent. */
function splitSegmentsWithEntities(segments: Segment[], entities: Entity[]): Segment[] {
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
      const m = mentionPattern(e.mention).exec(text);
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

/** The first sentence without its "Location — " prefix: the card's kicker and
 *  the globe already say where. */
function withoutDateline(sentence: string, location?: string | null): string {
  if (!location) return sentence;
  const prefix = `${location} \u2014 `;
  return sentence.startsWith(prefix) ? sentence.slice(prefix.length) : sentence;
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
}

/** URL scheme for tappable country mentions in article markdown.
 *  Writers emit `[Label](country:XX)` where XX is an ISO-3166 alpha-2 code.
 *  `StoryCard` intercepts the scheme in its openLink wrapper and opens
 *  `CountrySheet` instead of routing to the OS browser. */
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
      // No letterSpacing, like the `body` variant: on Android any tracking
      // makes a paragraph measure a line taller than it draws.
      // iOS measures line widths from glyph advances and ignores the kern
      // trail letterSpacing adds after the rightmost glyph. With the article
      // container's overflow:hidden, that ~1pt overhang clips the trailing
      // edge of the last character on each line — most visible on glyphs
      // with a vertical right side (closing curly quote, comma, semicolon).
      // 2pt of paddingRight gives the trail room without changing wrap or
      // column rhythm.
      paddingRight: 2,
      color: colors.text,
      marginBottom: typography.sizeBase * 0.5,
      fontVariant: ['oldstyle-nums'],
    },
    // Re-declare `fontVariant` on each emphasis style. RN drops fontVariant
    // across a font-family switch on Android, so without it a bolded "$106"
    // inside body prose silently flips to lining figures and breaks column
    // alignment with surrounding oldstyle digits.
    bold: {
      ...font.bold,
      fontVariant: ['oldstyle-nums'],
    },
    italic: {
      ...font.italic,
      fontVariant: ['oldstyle-nums'],
    },
    boldItalic: {
      ...font.boldItalic,
      fontVariant: ['oldstyle-nums'],
    },
    // A link to the web: the body's ink with the underline in `accent`, the
    // web's own `a`. It was `accent` ink, a step quieter than the sentence it
    // sat in — the fault the country links below were cured of. The
    // underline's colour is iOS-only, as below.
    link: {
      color: colors.text,
      textDecorationLine: 'underline',
      textDecorationColor: colors.accent,
    },
    // Country and entity mentions: the body's own ink with a quiet underline,
    // the web's `.country-link` (text colour, a dotted rule in secondary).
    // They were `accent`, a step *lighter* than the words around them, so a
    // word you could open read as a faded one (2026-09-23). The underline's
    // colour and dotting are iOS-only; Android draws a solid rule in the
    // text's own colour, tight to the baseline.
    countryLink: {
      color: colors.text,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textDecorationColor: colors.textSecondary,
    },
    entity: {
      color: colors.text,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textDecorationColor: colors.textSecondary,
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
            // Label inline links for assistive tech (the entity case already
            // does). Country mentions open a stats sheet ("button"); plain URLs
            // open the browser ("link"). Without this, screen-reader users get
            // an unlabeled run swallowed by the article wrapper.
            accessibilityRole={isCountry ? 'button' : 'link'}
            accessibilityLabel={isCountry ? `${seg.text} — tap for country data` : seg.text}
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

export interface SentenceOptions {
  /** The story's dateline place, cut from the head of the first sentence. */
  location?: string | null;
  openLink?: LinkOpener;
  /** Tappable rich-noun mentions in the body — each one's first occurrence
   *  across the sentence list becomes a tappable `<Text>` with `onEntityPress`. */
  entities?: Entity[];
  onEntityPress?: EntityPressHandler;
}

/**
 * A story's blocks, one block `Text` each.
 *
 * It also took a font size, a dateline printed above the first block and a
 * press for it, which no caller has passed since the full-screen reader went;
 * they, the dateline's style and a second copy of the block renderer are gone.
 */
export function renderSentences(
  sentences: string[],
  mdStyles: MarkdownStyles,
  { location, openLink = defaultOpenLink, entities, onEntityPress }: SentenceOptions = {},
): ReactNode[] {
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
      if (mentionPattern(e.mention).test(plain)) used.push(e);
      else next.push(e);
    }
    remaining.length = 0;
    remaining.push(...next);
    return used;
  };

  /** One block of the article: its own `Text`, carrying `mdStyles.sentence`'s
   *  `marginBottom`, which is the gap the reader sees between paragraphs.
   *
   *  It briefly returned bare inline runs instead, so a caller could set
   *  several blocks as one paragraph and save the gaps. That merge is what
   *  `<blank line between blocks>` in `scripts/write-prompt.md` exists to
   *  prevent, and it is gone: a block is a block on screen. */
  return sentences.map((sentence, i) => {
    const segments = parseInline(i === 0 ? withoutDateline(sentence, location) : sentence);
    const rendered = entities?.length
      ? splitSegmentsWithEntities(segments, consume(segments))
      : segments;
    return (
      <Text
        key={i}
        {...SENTENCE_TEXT_PROPS}
        style={mdStyles.sentence}
        maxFontSizeMultiplier={MAX_FONT_SCALE.body}
      >
        {renderSegments(rendered, mdStyles, openLink, onEntityPress)}
      </Text>
    );
  });
}
