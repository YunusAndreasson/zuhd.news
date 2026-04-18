import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, memo } from 'react';
import { ICON, type TextTone, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IoniconName;
  /** Pixel size — `sm` (14) or `md` (20). Anything else is a mistake. */
  size?: keyof typeof ICON;
  /** Semantic tone. Ignored if `color` is set. */
  tone?: TextTone;
  /** Explicit color override. Prefer `tone`. */
  color?: string;
}

/**
 * Centralizes the icon-pack choice (currently Ionicons) and the two-tier size
 * system. Never use `<Ionicons>` directly in app code — go through this.
 */
export const Icon = memo(function Icon({
  name,
  size = 'md',
  tone = 'secondary',
  color,
}: IconProps) {
  const { colors } = useTheme();
  const resolved = color ?? toneColor(tone, colors);
  return <Ionicons name={name} size={ICON[size]} color={resolved} />;
});
