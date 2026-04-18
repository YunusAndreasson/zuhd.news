import { memo, type ReactNode } from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { GAP, type GapToken, SPACING } from '../../constants/theme';

type SpacingToken = keyof typeof SPACING;

export interface StackProps extends Omit<ViewProps, 'style'> {
  direction?: 'row' | 'column';
  gap?: GapToken;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  padding?: SpacingToken;
  paddingX?: SpacingToken;
  paddingY?: SpacingToken;
  fill?: boolean;
  wrap?: boolean;
  style?: ViewProps['style'];
  children?: ReactNode;
}

export const Stack = memo(function Stack({
  direction = 'column',
  gap = 'none',
  align,
  justify,
  padding,
  paddingX,
  paddingY,
  fill,
  wrap,
  style,
  children,
  ...rest
}: StackProps) {
  const computed: ViewStyle = {
    flexDirection: direction,
    gap: GAP[gap],
    ...(align !== undefined && { alignItems: align }),
    ...(justify !== undefined && { justifyContent: justify }),
    ...(padding !== undefined && { padding: SPACING[padding] }),
    ...(paddingX !== undefined && { paddingHorizontal: SPACING[paddingX] }),
    ...(paddingY !== undefined && { paddingVertical: SPACING[paddingY] }),
    ...(fill && { flex: 1 }),
    ...(wrap && { flexWrap: 'wrap' }),
  };
  return (
    <View {...rest} style={[computed, style]}>
      {children}
    </View>
  );
});
