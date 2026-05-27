import { memo } from 'react';
import { Text, View } from 'react-native';
import { MAX_FONT_SCALE } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import {
  type LinkOpener,
  type MarkdownStyles,
  parseInline,
  renderSegments,
} from '../../lib/markdown';
import { SourceCaption } from './SourceCaption';

interface ProseBlockProps {
  text: string;
  mdStyles: MarkdownStyles;
  fontSize?: number;
  /** Small-caps dateline prefix (e.g. "5m ago") — only shown for the first prose block. */
  dateline?: string | null;
  /** Stripped from the start of the text when present (e.g. "Tehran — "). */
  locationPrefix?: string | null;
  openLink: LinkOpener;
  sourceLabel?: string;
}

/** ProseBlock uses the markdown style system (mdStyles) directly because
 *  it composes inline segments with per-segment style (links, emphasis,
 *  dateline). The `<Text variant>` API can't express segment-level style
 *  mixing. Sizes and colors still flow from the theme via markdown.tsx. */
export const ProseBlock = memo(function ProseBlock({
  text,
  mdStyles,
  fontSize,
  dateline,
  locationPrefix,
  openLink,
  sourceLabel,
}: ProseBlockProps) {
  const { typography } = useTheme();
  const size = fontSize ?? typography.sizeBase;
  const sizeStyle = fontSize
    ? {
        fontSize: size,
        lineHeight: size * typography.leadingBody,
        marginBottom: size * 0.5,
      }
    : null;

  let body = text;
  if (locationPrefix && body.startsWith(locationPrefix)) {
    body = body.slice(locationPrefix.length);
  }

  const proseText = (
    <Text style={[mdStyles.sentence, sizeStyle]} maxFontSizeMultiplier={MAX_FONT_SCALE.body}>
      {renderSegments(parseInline(body), mdStyles, openLink)}
    </Text>
  );

  if (!dateline && !sourceLabel) return proseText;
  return (
    <View>
      {dateline && <Text style={mdStyles.dateline}>{dateline}</Text>}
      {proseText}
      {sourceLabel && <SourceCaption label={sourceLabel} />}
    </View>
  );
});
