import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, type TextStyle } from 'react-native';
import type { ColorPalette, FontSet, Typography } from '../constants/theme';

export type Segment = {
  type: 'text' | 'bold' | 'italic' | 'boldItalic' | 'link';
  text: string;
  url?: string;
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
  const androidBase =
    Platform.OS === 'android'
      ? { includeFontPadding: false as const, textAlignVertical: 'center' as const }
      : {};
  return StyleSheet.create({
    sentence: {
      ...font.regular,
      ...androidBase,
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
      fontStyle: 'italic',
    },
    boldItalic: {
      ...font.boldItalic,
      fontStyle: 'italic',
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

function renderSegments(segments: Segment[], mdStyles: MarkdownStyles): ReactNode[] {
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
          <Text
            key={j}
            style={mdStyles.link}
            onPress={() => seg.url && WebBrowser.openBrowserAsync(seg.url)}
          >
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
): ReactNode[] {
  const size = fontSize ?? typography.sizeBase;
  const sizeStyle = fontSize
    ? {
        fontSize: size,
        lineHeight: size * typography.leadingBody,
        marginBottom: size * 0.5,
      }
    : null;

  return sentences.map((sentence, i) => {
    if (i === 0) {
      // Strip "Location — " prefix from first sentence if present
      let rest = sentence;
      if (location) {
        const prefix = `${location} \u2014 `;
        if (sentence.startsWith(prefix)) rest = sentence.slice(prefix.length);
      }
      // Show dateline (e.g. time ago) in small-caps before first sentence
      if (dateline) {
        return (
          <Text key={i} style={[mdStyles.sentence, sizeStyle]} selectable>
            <Text style={mdStyles.dateline}>{dateline}</Text>
            {'  '}
            {renderSegments(parseInline(rest), mdStyles)}
          </Text>
        );
      }
      if (rest !== sentence) {
        return (
          <Text key={i} style={[mdStyles.sentence, sizeStyle]} selectable>
            {renderSegments(parseInline(rest), mdStyles)}
          </Text>
        );
      }
    }
    return (
      <Text key={i} style={[mdStyles.sentence, sizeStyle]} selectable>
        {renderSegments(parseInline(sentence), mdStyles)}
      </Text>
    );
  });
}
