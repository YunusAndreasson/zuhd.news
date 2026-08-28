import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ComponentProps, memo } from 'react';
import { Platform } from 'react-native';
import { ICON, type TextTone, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type SFSymbolName =
  NonNullable<SymbolViewProps['name']> extends infer N ? (N extends string ? N : never) : never;

export interface IconProps {
  name: IoniconName;
  /** Pixel size — `sm` (14), `md` (20), `lg` (26). Anything else is a mistake. */
  size?: keyof typeof ICON;
  /** Semantic tone. Ignored if `color` is set. */
  tone?: TextTone;
  /** Explicit color override. Prefer `tone`. */
  color?: string;
}

/**
 * iOS renders the matching SF Symbol (system-native, optically tuned at every
 * size, automatic tinting). Android falls back to Ionicons since SF Symbols
 * are Apple-only. The cross-platform `<Icon>` API stays unified — call sites
 * pass an Ionicons name and the platform resolution happens here.
 *
 * If you add an Ionicons name not in `IONICON_TO_SF`, iOS will silently fall
 * back to Ionicons for that name (no missing-glyph placeholder).
 */
const IONICON_TO_SF: Partial<Record<string, SFSymbolName>> = {
  // The delta chip's direction arrows. A filled triangle rather than a line
  // arrow: at 14px beside 13pt type a stroked glyph reads as noise, and the
  // triangle is the mark a reader already associates with a price move.
  'caret-up': 'arrowtriangle.up.fill',
  'caret-down': 'arrowtriangle.down.fill',
  'chevron-back': 'chevron.left',
  'chevron-forward': 'chevron.right',
  'chevron-up': 'chevron.up',
  'chevron-down': 'chevron.down',
  'close-circle': 'xmark.circle.fill',
  'close-sharp': 'xmark',
  // iOS reads a hamburger as a Material idiom; `ellipsis` is the native
  // "menu/more" affordance. Android keeps the Ionicons hamburger.
  menu: 'ellipsis',
  'information-circle': 'info.circle.fill',
  'information-circle-outline': 'info.circle',
  pause: 'pause.fill',
  play: 'play.fill',
  search: 'magnifyingglass',
  share: 'square.and.arrow.up',
};

/**
 * Centralizes the icon-pack choice and the three-tier size system. Never use
 * `<Ionicons>` or `<SymbolView>` directly in app code — go through this.
 */
export const Icon = memo(function Icon({
  name,
  size = 'md',
  tone = 'secondary',
  color,
}: IconProps) {
  const { colors } = useTheme();
  const resolved = color ?? toneColor(tone, colors);
  const px = ICON[size];

  if (Platform.OS === 'ios') {
    const sf = IONICON_TO_SF[name];
    if (sf) {
      // SF Symbols inherit optical sizing — no `width`/`height` style, just
      // `size` prop. The square frame style keeps layout math compatible
      // with the Ionicons drop-in expectation.
      return (
        <SymbolView name={sf} size={px} tintColor={resolved} style={{ width: px, height: px }} />
      );
    }
  }
  return <Ionicons name={name} size={px} color={resolved} />;
});
