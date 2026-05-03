import { memo, useMemo } from 'react';
import type { TextStyle } from 'react-native';
import type { TextTone, TextVariant } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import {
  type LinkOpener,
  makeMarkdownStyles,
  parseInline,
  renderSegments,
} from '../../lib/markdown';
import { useOpenLink } from '../../lib/open-link';
import { Text } from './Text';

export interface MarkdownProps {
  /** Markdown source. Renders nothing when null / undefined / empty. */
  children: string | null | undefined;
  variant: TextVariant;
  tone?: TextTone;
  selectable?: boolean;
  /** Custom link handler — typically used to intercept the `country:XX`
   *  scheme and dispatch through CountrySheet rather than the OS
   *  browser (see ArticlePage). Defaults to `useOpenLink()`, which
   *  routes everything through `Linking.openURL`. */
  openLink?: LinkOpener;
  style?: TextStyle;
}

/** Markdown-aware text. Handles `**bold**`, `*italic*`, and `[link](url)`
 *  inline; falls through gracefully when the input is empty.
 *
 *  Prefer this over `<Text>{maybeMd}</Text>` for any data field that may
 *  contain markdown — server-composed fields like `entry.body`,
 *  `alert.narrative`, and similar LLM-emitted prose. The naked-Text
 *  shape was the bug class behind the asterisk leak fixed 2026-05-03
 *  in ContextSheet + DisasterSheet; using this primitive makes the
 *  same mistake structurally hard to commit. */
export const Markdown = memo(function Markdown({
  children,
  variant,
  tone,
  selectable,
  openLink,
  style,
}: MarkdownProps) {
  const { colors, font, typography } = useTheme();
  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );
  const defaultOpenLink = useOpenLink();
  const handleLink = openLink ?? defaultOpenLink;

  if (!children) return null;
  return (
    <Text variant={variant} tone={tone} selectable={selectable} style={style}>
      {renderSegments(parseInline(children), mdStyles, handleLink)}
    </Text>
  );
});
