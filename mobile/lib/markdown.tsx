import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { COLORS, FONT, TYPOGRAPHY } from '../constants/theme';

type Segment = { type: 'text' | 'bold' | 'italic' | 'link'; text: string; url?: string };

function smartTypography(s: string): string {
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

function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: smartTypography(line.slice(lastIndex, match.index)) });
    }
    if (match[1]) segments.push({ type: 'bold', text: smartTypography(match[1]) });
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

function renderSegments(segments: Segment[]): ReactNode[] {
  return segments.map((seg, j) => {
    switch (seg.type) {
      case 'bold':
        return (
          <Text key={j} style={styles.bold}>
            {seg.text}
          </Text>
        );
      case 'italic':
        return (
          <Text key={j} style={styles.italic}>
            {seg.text}
          </Text>
        );
      case 'link':
        return (
          <Text key={j} style={styles.link} onPress={() => Linking.openURL(seg.url!)}>
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
  fontSize?: number,
  location?: string | null,
): ReactNode[] {
  const size = fontSize ?? TYPOGRAPHY.sizeBase;
  const sizeStyle = fontSize
    ? {
        fontSize: size,
        lineHeight: size * TYPOGRAPHY.leadingBody,
        marginBottom: size * 0.5,
      }
    : null;

  return sentences.map((sentence, i) => {
    // First sentence: use location meta for dateline, strip "Location — " prefix
    if (i === 0 && location) {
      const prefix = location + ' \u2014 ';
      const rest = sentence.startsWith(prefix) ? sentence.slice(prefix.length) : sentence;
      return (
        <Text key={i} style={[styles.sentence, sizeStyle]} selectable>
          <Text style={styles.dateline}>{location.toLowerCase()}</Text>
          {'  '}
          {renderSegments(parseInline(rest))}
        </Text>
      );
    }
    return (
      <Text key={i} style={[styles.sentence, sizeStyle]} selectable>
        {renderSegments(parseInline(sentence))}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  sentence: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
    marginBottom: TYPOGRAPHY.sizeBase * 0.5,
    fontVariant: ['oldstyle-nums'],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  bold: {
    fontFamily: FONT.bold,
  },
  italic: {
    fontStyle: 'italic',
  },
  link: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
  dateline: {
    fontFamily: FONT.smallCaps,
  },
});
