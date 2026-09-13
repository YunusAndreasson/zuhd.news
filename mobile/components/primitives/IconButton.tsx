import { memo, type ReactNode } from 'react';
import { HIT_SLOP } from '../../constants/theme';
import { Pressable, type PressableProps } from './Pressable';

export interface IconButtonProps extends Omit<PressableProps, 'children'> {
  accessibilityLabel: string;
  children: ReactNode;
}

/**
 * Compact icon-only button: a `Pressable` with `hitSlop` and
 * `accessibilityRole="button"` baked in, so callers supply only `onPress`,
 * `accessibilityLabel`, and an `<Icon>` child. Spring press and haptics come
 * from `Pressable` itself.
 */
export const IconButton = memo(function IconButton({
  hitSlop = HIT_SLOP,
  accessibilityRole = 'button',
  ...rest
}: IconButtonProps) {
  return <Pressable {...rest} hitSlop={hitSlop} accessibilityRole={accessibilityRole} />;
});
