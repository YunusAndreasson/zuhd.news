import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { ANDROID_TEXT_BASE } from '../constants/platform';
import {
  type ColorPalette,
  type FontSet,
  MAX_FONT_SCALE,
  type Typography,
} from '../constants/theme';

export type Segment = {
  type: 'text' | 'bold' | 'italic' | 'boldItalic' | 'link';
  text: string;
  url?: string;
};

export type LinkOpener = (url: string) => void;

const defaultOpenLink: LinkOpener = (url) => {
  WebBrowser.openBrowserAsync(url).catch(() => {});
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

export interface MarkdownStyles {
  sentence: TextStyle;
  bold: TextStyle;
  italic: TextStyle;
  boldItalic: TextStyle;
  link: TextStyle;
  dateline: TextStyle;
}

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
    dateline: {
      ...font.smallCaps,
    },
  });
}

export function renderSegments(
  segments: Segment[],
  mdStyles: MarkdownStyles,
  openLink: LinkOpener,
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
      case 'link':
        return (
          <Text key={j} style={mdStyles.link} onPress={() => seg.url && openLink(seg.url)}>
            {seg.text}
          </Text>
        );
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

  return sentences.map((sentence, i) => {
    const isLast = i === lastIdx;
    if (i === 0) {
      // Strip "Location — " prefix from first sentence if present
      let rest = sentence;
      if (location) {
        const prefix = `${location} \u2014 `;
        if (sentence.startsWith(prefix)) rest = sentence.slice(prefix.length);
      }
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
            {renderSegments(parseInline(rest), mdStyles, openLink)}
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
          {renderSegments(parseInline(rest), mdStyles, openLink)}
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
        {renderSegments(parseInline(sentence), mdStyles, openLink)}
        {isLast && trailing}
      </Text>
    );
  });
}
