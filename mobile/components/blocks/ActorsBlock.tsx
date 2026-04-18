import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import type { Actor } from '../../types';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle } from './shared';

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
  const isContext = variant === 'context';

  return (
    <View style={blockContainerStyle[isContext ? 'context' : 'article']}>
      {label ? (
        <Text variant="labelXs" style={styles.label}>
          {label}
        </Text>
      ) : null}
      {people.map((p, i) => {
        const ruled = i < people.length - 1;
        const flag = p.cc ? ccToFlag(p.cc) : null;
        return (
          <Animated.View
            key={`${p.name}-${i}`}
            entering={FadeIn.duration(ANIMATION.normal).delay(staggerDelay(i))}
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
  label: {
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  flag: {
    fontSize: 15,
  },
  textCol: {
    flex: 1,
  },
  meta: {
    marginTop: 1,
  },
});
