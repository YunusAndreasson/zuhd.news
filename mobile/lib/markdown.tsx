import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ColorPalette, FontSet, Typography } from '../constants/theme';

export type Segment = { type: 'text' | 'bold' | 'italic' | 'boldItalic' | 'link'; text: string; url?: string };

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
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: smartTypography(line.slice(lastIndex, match.index)) });
    }
    if (match[1]) {
      // Parse nested italic (*...*) within bold content
      const boldContent = match[1];
      const italicRe = /\*(.+?)\*/g;
      let bLast = 0;
      let im;
      let hasNested = false;
      while ((im = italicRe.exec(boldContent)) !== null) {
        hasNested = true;
        if (im.index > bLast)
          segments.push({ type: 'bold', text: smartTypography(boldContent.slice(bLast, im.index)) });
        segments.push({ type: 'boldItalic', text: smartTypography(im[1]!) });
        bLast = italicRe.lastIndex;
      }
      if (!hasNested) {
        segments.push({ type: 'bold', text: smartTypography(boldContent) });
      } else if (bLast < boldContent.length) {
        segments.push({ type: 'bold', text: smartTypography(boldContent.slice(bLast)) });
      }
    }
    else if (match[2]) segments.push({ type: 'italic', text: smartTypography(match[2]) });
    else if (match[3])
      segments.push({ type: 'link', text: smartTypography(match[3]), url: match[4] });
    lastIndex = regex.lastIndex;
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
      fontFamily: font.regular,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      color: colors.text,
      marginBottom: typography.sizeBase * 0.5,
      fontVariant: ['oldstyle-nums'],
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    bold: {
      fontFamily: font.bold,
    },
    italic: {
      fontStyle: 'italic',
    },
    boldItalic: {
      fontFamily: font.bold,
      fontStyle: 'italic',
    },
    link: {
      color: colors.accent,
      textDecorationLine: 'underline',
    },
    dateline: {
      fontFamily: font.smallCaps,
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
          <Text key={j} style={mdStyles.link} onPress={() => WebBrowser.openBrowserAsync(seg.url!)}>
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
    // First sentence: use location meta for dateline, strip "Location — " prefix
    if (i === 0 && location) {
      const prefix = location + ' \u2014 ';
      const rest = sentence.startsWith(prefix) ? sentence.slice(prefix.length) : sentence;
      return (
        <Text key={i} style={[mdStyles.sentence, sizeStyle]} selectable>
          <Text style={mdStyles.dateline}>{location.toLowerCase()}</Text>
          {'  '}
          {renderSegments(parseInline(rest), mdStyles)}
        </Text>
      );
    }
    return (
      <Text key={i} style={[mdStyles.sentence, sizeStyle]} selectable>
        {renderSegments(parseInline(sentence), mdStyles)}
      </Text>
    );
  });
}
