import { memo, useCallback, useRef } from 'react';
import {
  type GestureResponderEvent,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '../../hooks/usePressScale';

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Count a press only when the finger lifts within this many points of where
   * it went down. For a control a swipe can start on: a `Pressable` fires on
   * any touch that ends inside it, and a sideways flick the deck's pan claimed
   * late once opened the share sheet (2026-09-24, `StoryCard`'s `useTapOnly`,
   * the same rule for the card's own targets).
   */
  tapSlop?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Full-bleed content row press. A short press scale baked in
 * (`usePressScale`). No haptic: an ordinary press never knocks
 * (`lib/haptics.ts`) — a handler whose press commits something gives its own.
 *
 * Pair with `IconButton` for compact icon targets that need `hitSlop` + role.
 */
export const Pressable = memo(function Pressable({
  onPress,
  style,
  onPressIn,
  onPressOut,
  tapSlop,
  ...rest
}: PressableProps) {
  const start = useRef({ x: 0, y: 0 });
  const trackPressIn = useCallback(
    (e: GestureResponderEvent) => {
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onPressIn?.(e);
    },
    [onPressIn],
  );
  const {
    animatedStyle,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
  } = usePressScale(tapSlop === undefined ? onPressIn : trackPressIn, onPressOut);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (tapSlop !== undefined) {
        const dx = e.nativeEvent.pageX - start.current.x;
        const dy = e.nativeEvent.pageY - start.current.y;
        if (dx * dx + dy * dy > tapSlop * tapSlop) return;
      }
      onPress();
    },
    [onPress, tapSlop],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
});
