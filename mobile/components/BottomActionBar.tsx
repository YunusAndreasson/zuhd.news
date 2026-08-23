import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Pressable, Text } from './primitives';

// Compact pills — small visible footprint so the globe has more room.
// Tap target stays ≥48pt thanks to the inflated hitSlop below.
const PILL_HIT_SLOP = 16;

/**
 * How far the scrim behind the pills reaches up the page.
 *
 * Tall enough that the ramp is a gradient rather than an edge — a short fade
 * over a line of body text reads as a band across the page, which is a second
 * artefact rather than a fix for the first — and short enough to stop below
 * the last line a card actually puts on screen.
 *
 * That second bound is measured, not chosen. `CardFrame`'s content ends 64pt
 * above the page bottom, and the thing sitting on that last line is the source
 * caption, which is already set quiet. At 96 the ramp still carried ~0.4 alpha
 * where the caption sits and washed it to the edge of legible — an app whose
 * own rule is that a card citing IMF PortWatch has to say so cannot dim the
 * line where it says it. 72 puts the caption at ~0.07.
 */
const SCRIM_H = 72;

/**
 * The stops. Solid under the pills, gone before the card's last line.
 *
 * Weighted hard to the bottom: the job is to stop a flat pill reading as a
 * cell of the list behind it, which only needs the ink immediately around the
 * pill. Anything reaching further up is dimming content to solve a problem
 * content never had.
 */
const SCRIM_STOPS = [0, 0.55, 0.82, 1];

interface BottomActionBarProps {
  bottomInset: number;
  zoomLabel: string;
  onBriefingPress: () => void;
  onZoomPress: () => void;
  onSharePress: () => void;
  /**
   * Whether the section behind the bar is the article river.
   *
   * Two of the three pills only mean anything there, and they were showing on
   * all six sections:
   *
   *   zoom   cycles the globe's clip, and the globe is on `news` only. On a
   *          card column the pill was inert — a control that answers a tap by
   *          doing nothing, which is worse than an absent one because the
   *          reader spends a tap finding out.
   *   share  shares `activeArticleRef`, the last article read. Standing on a
   *          Brent card and tapping it sent whoever received it a link to an
   *          unrelated story. Not dead chrome — wrong chrome.
   *
   * `listen` survives everywhere: the briefing is the day's news read aloud
   * and is not about whatever is on screen, so it is reachable from anywhere.
   *
   * Sharing a *card* is worth having and is not this change: it needs a URL
   * per card, and only the indicator-backed ones have one (`/e/{id}`).
   */
  articleActions: boolean;
  /**
   * Leave the open detail, when one is open.
   *
   * The way out used to be a 34pt target in the page's top-right corner, and
   * on a phone held in one hand that corner is the single least reachable
   * point on the screen — a right thumb sweeps an arc from the bottom-right
   * and does not get near it without regripping. Android readers had a way
   * round it that nobody was told about (the system back gesture from the
   * screen edge); iOS readers had none, because nothing here is a navigator
   * with an interactive pop.
   *
   * So the way out is also down here, at the far right of the bar, which is
   * where the thumb already is. The corner control stays: it is the
   * conventional place to look, it is what a two-handed or left-handed reader
   * reaches for first, and it is the only one still on screen while the
   * briefing player owns this row.
   *
   * Absent on an index — there is nothing open to leave.
   */
  onClosePress?: () => void;
}

function ActionPill({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  // Spring press via the primitive; haptic handled by each callsite's
  // handler (zoom ticks, share/context/briefing impact), so we pass 'none'
  // here to avoid double-firing.
  return (
    <Pressable
      onPress={onPress}
      haptic="none"
      hitSlop={PILL_HIT_SLOP}
      style={[styles.actionPill, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Text variant="labelSm">{label}</Text>
    </Pressable>
  );
}

export function BottomActionBar({
  bottomInset,
  zoomLabel,
  onBriefingPress,
  onZoomPress,
  onSharePress,
  articleActions,
  onClosePress,
}: BottomActionBarProps) {
  const { bgAlpha } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scrimColors = useMemo(
    () => [bgAlpha(0), bgAlpha(0.35), bgAlpha(0.8), bgAlpha(1)],
    [bgAlpha],
  );

  return (
    <View
      style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      {/* A scrim, and only on the card columns.

          The pills are flat by design — "definition, not elevation; no shadow"
          — which works over the globe, where a hairline edge is enough to
          separate a control from a coastline. Over a column of type it does
          not: the fifteen-currency table scrolled a row of flags and labels
          directly under `listen`, and with no depth cue and no backdrop the
          pill read as a cell of the table that had lost its text rather than
          as a control floating above one.

          Gated on `!articleActions`, which is already the flag for "the
          section behind this bar is not the river". On `news` the backdrop is
          the globe and `ArticleList` draws its own fade; a second one here
          would dim it twice.

          Skia rather than a CSS gradient for the reason `ArticleList` gives at
          length: the RN gradient silently fails on iOS release builds, and
          this is the path the globe has already proven on both platforms.
          `dither` because a long alpha ramp over the dark background bands. */}
      {!articleActions ? (
        <Canvas style={styles.scrim} pointerEvents="none">
          <Rect x={0} y={0} width={screenWidth} height={SCRIM_H} dither>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, SCRIM_H)}
              colors={scrimColors}
              positions={SCRIM_STOPS}
            />
          </Rect>
        </Canvas>
      ) : null}

      <ActionPill
        label="listen"
        onPress={onBriefingPress}
        accessibilityLabel="Daily briefing"
        accessibilityHint="Plays today's audio briefing"
      />

      <View style={styles.bottomSpacer} />

      {/* One row, because two pills that both mean "an action for what is on
          screen" should not sit in two groups. `close` is last so it lands
          under the thumb; `zoom` and `share` keep their order and their
          gate. */}
      {articleActions || onClosePress ? (
        <View style={styles.rightActions}>
          {articleActions ? (
            <>
              <ActionPill
                label={zoomLabel}
                onPress={onZoomPress}
                accessibilityLabel="Globe zoom"
                accessibilityHint="Cycles through zoom levels"
              />
              <ActionPill
                label="share"
                onPress={onSharePress}
                accessibilityLabel="Share article"
                accessibilityHint="Opens the system share sheet"
              />
            </>
          ) : null}
          {onClosePress ? (
            <ActionPill
              label="close"
              onPress={onClosePress}
              accessibilityLabel="Back to the list"
              accessibilityHint="Closes this and returns to the list"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    // Mirror `SectionBar` and the article body: pill outer edges land on
    // the same vertical as the article column, so chrome top and bottom
    // share one rhythm. Previously `SPACING.md` (16) left a 2px outdent
    // against the body's `articlePadding` (14).
    paddingHorizontal: SPACING.articlePadding,
    zIndex: 10,
  },
  bottomSpacer: {
    flex: 1,
  },
  // Anchored to the bar's own bottom edge and drawn upward behind everything
  // in it. Outside the row's flex flow — `position: absolute` — so it cannot
  // push the pills or take a share of the width they lay out against.
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCRIM_H,
  },
  rightActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    // Hairline edge so the pill always reads as a defined control over the
    // variable globe backdrop (land, coastline, city-glow), where the low-lift
    // `pillBg` fill alone can blend into what's behind it — especially in dark
    // mode. `colors.rule` inverts the right way per mode: lighter-than-map in
    // dark, darker-than-cream in light. Definition over elevation — no shadow.
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
