import { memo, type ReactNode, useEffect, useState } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { IS_ANDROID } from '../../constants/platform';
import {
  type TextTone,
  type TextVariant,
  toneColor,
  VARIANT_CAP,
  VARIANT_TEXT_PROPS,
} from '../../constants/theme';
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

/**
 * A spaced dash never starts a line: the space before it becomes a no-break
 * space, so the dash stays with the word it follows. Android broke before it —
 * About printed "had named the discipline" over "— zuhd: abandon what…".
 * Story text gets the same rule from `smartTypography`, run by run.
 */
function keepDashes(children: ReactNode): ReactNode {
  if (typeof children !== 'string' || !/ [\u2013\u2014]/.test(children)) return children;
  return children.replace(/ ([\u2013\u2014])/g, '\u00a0$1');
}

/** Long enough for a sheet's window to have drawn its first frame. */
const SELECTABLE_AFTER_MS = 600;

/**
 * Selectable text on Android, switched on a moment after it mounts.
 *
 * A platform sheet is a new window, and a new window does not know it is in
 * touch mode until after its views are attached. React Native re-applies
 * `selectable` on attach, which makes the text focusable at exactly that
 * moment, so the window hands it the focus and Android paints its focus
 * highlight over it: a grey band on the first selectable text of every sheet —
 * the outlet's description in sources, About's opening paragraph, a hazard's
 * focal number. Made selectable once the window is up, the text is never
 * offered the focus, and a long press still selects it.
 */
function LateSelectableText(props: RNTextProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), SELECTABLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return <RNText {...props} selectable={ready} />;
}

export const Text = memo(function Text({
  variant,
  tone,
  scale,
  style,
  maxFontSizeMultiplier,
  children,
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

  const Component = rest.selectable && IS_ANDROID ? LateSelectableText : RNText;

  return (
    // Variant-role line-breaking/Dynamic Type props apply first so any
    // call-site prop can still override them.
    <Component
      {...VARIANT_TEXT_PROPS[variant]}
      {...rest}
      style={[baseStyle, toneStyle, scaleStyle, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? VARIANT_CAP[variant]}
    >
      {keepDashes(children)}
    </Component>
  );
});
