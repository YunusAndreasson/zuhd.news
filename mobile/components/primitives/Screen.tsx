import { memo, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

export interface ScreenProps extends Omit<ViewProps, 'style'> {
  /** Safe-area edges to apply. Omit for no safe-area handling (a plain View). */
  edges?: Edge[];
  /** Apply `SPACING.screenPadding` on horizontal edges. */
  padded?: boolean;
  style?: ViewProps['style'];
  children?: ReactNode;
}

export const Screen = memo(function Screen({
  edges,
  padded,
  style,
  children,
  ...rest
}: ScreenProps) {
  const { colors } = useTheme();
  const base = [
    { flex: 1, backgroundColor: colors.bg },
    padded && { paddingHorizontal: SPACING.screenPadding },
    style,
  ];
  if (edges) {
    return (
      <SafeAreaView edges={edges} {...rest} style={base}>
        {children}
      </SafeAreaView>
    );
  }
  return (
    <View {...rest} style={base}>
      {children}
    </View>
  );
});
