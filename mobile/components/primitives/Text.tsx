import { memo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { type TextTone, type TextVariant, toneColor, VARIANT_CAP } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant: TextVariant;
  tone?: TextTone;
  /** Multiply the variant's fontSize and lineHeight (keeps leading ratio).
   *  Use sparingly — prefer variants first. Useful when a single call site
   *  needs dynamic sizing (e.g. titles that shrink with length). */
  scale?: number;
  style?: RNTextProps['style'];
}

export const Text = memo(function Text({
  variant,
  tone,
  scale,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const { colors, textVariants } = useTheme();
  const baseStyle = textVariants[variant];
  const toneStyle = tone ? { color: toneColor(tone, colors) } : null;
  const scaleStyle =
    scale !== undefined && scale !== 1
      ? ({
          fontSize: Math.round((baseStyle.fontSize ?? 0) * scale),
          lineHeight: Math.round((baseStyle.lineHeight ?? 0) * scale),
        } as TextStyle)
      : null;

  return (
    <RNText
      {...rest}
      style={[baseStyle, toneStyle, scaleStyle, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? VARIANT_CAP[variant]}
    />
  );
});
