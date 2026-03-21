import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import type { Article, Category } from '../types';
import { Globe, type GlobeRef } from './globe/Globe';
import { type DotLocation, extractDotLocations } from './globe/storyDots';


const HIJRI_DATE = new Intl.DateTimeFormat('en-u-ca-islamic', {
  day: 'numeric',
  month: 'long',
})
  .format(new Date())
  .replace(' AH', '');

// Moon phase: 0 = new, 0.5 = full, 1 = new again
const MOON_EPOCH = 1738151760000; // Jan 29, 2025 12:36 UTC (known new moon)
const SYNODIC = 29.53058770576;
const MOON_PHASE = (((Date.now() - MOON_EPOCH) / 86400000) % SYNODIC + SYNODIC) % SYNODIC / SYNODIC;

function MoonPhase({ size = 10 }: { size?: number }) {
  const r = size / 2;
  const sweep = Math.cos(MOON_PHASE * 2 * Math.PI);
  const tW = Math.abs(sweep) * r;

  const p = Skia.Path.Make();
  p.addArc({ x: 0, y: 0, width: size, height: size }, -90, 180);
  p.addArc(
    { x: r - tW, y: 0, width: tW * 2, height: size },
    90,
    sweep > 0 ? 180 : -180,
  );
  p.close();

  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={r} cy={r} r={r} color={COLORS.accent} opacity={0.3} />
      <Path path={p} color={COLORS.accent} opacity={0.8} />
    </Canvas>
  );
}

const HOLY_SITE_INFO = [
  { name: 'Mecca', desc: 'The Kaaba \u2014 direction of prayer for 1.8 billion Muslims' },
  { name: 'Medina', desc: 'Al-Masjid an-Nabawi \u2014 the Prophet\u2019s mosque' },
  { name: 'Jerusalem', desc: 'Al-Aqsa \u2014 the farthest mosque, site of the Night Journey' },
] as const;

interface TooltipData {
  titles: string[];
  subtitle?: string;
  golden?: boolean;
}

interface GlobePageProps {
  grouped: Record<Category, Article[]>;
  visible: boolean;
  onRefresh?: () => Promise<number>;
  onToast?: (msg: string) => void;
}

export function GlobePage({ grouped, visible, onRefresh, onToast }: GlobePageProps) {
  const insets = useSafeAreaInsets();
  const globeRef = useRef<GlobeRef>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const dots = useMemo(() => extractDotLocations(grouped), [grouped]);

  const handleRefresh = useCallback(async () => {
    globeRef.current?.recenter();
    try {
      const n = await onRefresh?.();
      onToast?.(n && n > 0 ? `${n} new article${n > 1 ? 's' : ''}` : 'Up to date');
    } catch {
      onToast?.('Could not refresh');
    }
  }, [onRefresh, onToast]);

  const showTooltip = useCallback((data: TooltipData) => {
    setTooltip(data);
  }, []);

  const handleDotTap = useCallback(
    (dot: DotLocation, country: string | null) => {
      showTooltip({
        titles: dot.titles,
        subtitle: country ?? undefined,
      });
    },
    [showTooltip],
  );

  const handleSiteTap = useCallback(
    (index: number) => {
      const site = HOLY_SITE_INFO[index];
      if (site) showTooltip({ titles: [site.desc], subtitle: site.name, golden: true });
    },
    [showTooltip],
  );

  const handleCountryTap = useCallback(
    (name: string) => {
      showTooltip({ titles: [], subtitle: name });
    },
    [showTooltip],
  );

  const dismissTooltip = useCallback(() => {
    setTooltip(null);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  return (
    <View style={styles.container}>
      <Globe
        ref={globeRef}
        dots={dots}
        visible={visible}
        onDotTap={handleDotTap}
        onSiteTap={handleSiteTap}
        onCountryTap={handleCountryTap}
        onEmptyTap={dismissTooltip}
      />

      {/* Tooltip */}
      {tooltip && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[styles.tooltip, { bottom: insets.bottom + SPACING.xxl }]}
        >
          <Pressable onPress={dismissTooltip}>
            {tooltip.subtitle && (
              <Text style={[styles.tooltipCountry, tooltip.golden && styles.tooltipGolden]}>
                {tooltip.subtitle.toUpperCase()}
              </Text>
            )}
            {tooltip.titles.map((title, i) => (
              <Text
                key={title}
                style={[styles.tooltipTitle, i > 0 && styles.tooltipTitleExtra]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ))}
          </Pressable>
        </Animated.View>
      )}

      {/* Footer: moon phase, date, refresh */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <MoonPhase size={10} />
        <Text style={styles.todayLabel}>{HIJRI_DATE} · today's news</Text>
        <Pressable
          onPress={handleRefresh}
          hitSlop={12}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Ionicons name="refresh-outline" size={12} color={COLORS.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tooltip: {
    position: 'absolute',
    left: SPACING.screenPadding,
    right: SPACING.screenPadding,
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tooltipCountry: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginBottom: SPACING.xs,
  },
  tooltipGolden: {
    color: COLORS.dome,
  },
  tooltipTitle: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeSm,
    lineHeight: TYPOGRAPHY.sizeSm * 1.4,
    color: COLORS.text,
  },
  tooltipTitleExtra: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  todayLabel: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
  },
});
