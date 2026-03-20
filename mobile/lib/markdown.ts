import React from 'react';
import { Text, StyleSheet, Linking } from 'react-native';
import { COLORS, FONT, TYPOGRAPHY } from '../constants/theme';

type Segment = { type: 'text' | 'bold' | 'italic' | 'link'; text: string; url?: string };

function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: line.slice(lastIndex, match.index) });
    }
    if (match[1]) segments.push({ type: 'bold', text: match[1] });
    else if (match[2]) segments.push({ type: 'italic', text: match[2] });
    else if (match[3]) segments.push({ type: 'link', text: match[3], url: match[4] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    segments.push({ type: 'text', text: line.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'text', text: line }];
}

function renderSegments(segments: Segment[]): React.ReactNode[] {
  return segments.map((seg, j) => {
    switch (seg.type) {
      case 'bold':
        return React.createElement(Text, { key: j, style: styles.bold }, seg.text);
      case 'italic':
        return React.createElement(Text, { key: j, style: styles.italic }, seg.text);
      case 'link':
        return React.createElement(
          Text,
          { key: j, style: styles.link, onPress: () => Linking.openURL(seg.url!) },
          seg.text,
        );
      default:
        return seg.text;
    }
  });
}

// Renders pre-split sentences from the API (server-side splitting)
export function renderSentences(sentences: string[]): React.ReactNode[] {
  return sentences.map((sentence, i) =>
    React.createElement(
      Text,
      { key: i, style: styles.sentence },
      ...renderSegments(parseInline(sentence)),
    ),
  );
}

const styles = StyleSheet.create({
  sentence: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
    marginBottom: TYPOGRAPHY.sizeBase * 0.5,
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
});
