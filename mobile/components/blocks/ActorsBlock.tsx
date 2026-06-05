import type { Actor } from '@shared/types';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { ANIMATION, FLAG, SPACING, staggerDelay } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle, blockSharedStyles } from './shared';

interface ActorsBlockProps {
  people: Actor[];
  label?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const ActorsBlock = memo(function ActorsBlock({
  people,
  label,
  variant = 'article',
  sourceLabel,
}: ActorsBlockProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelSm" style={blockSharedStyles.label}>
          {label}
        </Text>
      ) : null}
      {people.map((p, i) => {
        const ruled = i < people.length - 1;
        const flag = p.cc ? ccToFlag(p.cc) : null;
        return (
          <Animated.View
            key={`${p.name}-${i}`}
            entering={
              reduceMotion ? undefined : FadeIn.duration(ANIMATION.normal).delay(staggerDelay(i))
            }
            style={[
              styles.row,
              ruled && {
                borderBottomColor: colors.rule,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            {flag ? (
              <Text variant="body" style={styles.flag}>
                {flag}
              </Text>
            ) : null}
            <View style={styles.textCol}>
              <Text variant="bodyEmphasis" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="labelXs" numberOfLines={1} style={styles.meta}>
                {p.role.toUpperCase()}
                {p.years ? `  \u00b7  ${p.years}` : ''}
              </Text>
            </View>
          </Animated.View>
        );
      })}
      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  flag: {
    fontSize: FLAG.chip,
  },
  textCol: {
    flex: 1,
  },
  meta: {
    marginTop: 1,
  },
});
