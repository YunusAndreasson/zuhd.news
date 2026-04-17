import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ANIMATION, MAX_FONT_SCALE, SPACING, staggerDelay } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import type { Actor } from '../../types';
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
  const { colors, font, typography, textStyles } = useTheme();
  const isContext = variant === 'context';

  return (
    <View style={blockContainerStyle[isContext ? 'context' : 'article']}>
      {label ? (
        <Text
          style={[styles.label, textStyles.smallCapsXs]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.label}
        >
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
              <Text style={styles.flag} maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
                {flag}
              </Text>
            ) : null}
            <View style={styles.textCol}>
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: typography.sizeBase,
                  color: colors.textEmphasis,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.body}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              <Text
                style={[
                  styles.meta,
                  {
                    ...font.regular,
                    fontSize: typography.sizeXs,
                    color: colors.textSecondary,
                    letterSpacing: typography.trackingCaps,
                  },
                ]}
                maxFontSizeMultiplier={MAX_FONT_SCALE.label}
                numberOfLines={1}
              >
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
