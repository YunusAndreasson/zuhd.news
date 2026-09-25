import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import type { CardDelta } from '../lib/cards/types';
import { moveTone } from '../lib/valence';
import { Icon, Text } from './primitives';

/**
 * Which way the number went.
 *
 * Green up, red down, slate unchanged — on every surface, the strip, the cards
 * and the markets list alike (`moveTone`, 2026-09-25). It coloured what a move
 * meant for an ordinary life instead: oil up was red, a currency up green,
 * bitcoin slate, so one ▲ came in three colours for a reason the screen never
 * gave, beside globe arrows that were green up and red down. The user asked
 * for a screen that explains itself. Always coloured, never the near-white of
 * the label beside it, so a reader never has to ask whether a chip is
 * coloured at all. A contract's points stay slate: odds are never tinted.
 *
 * Before 2026-09-23 the strip alone coloured direction, so Brent's ▲23% was
 * green on the gauge and red on the card it opened. One rule everywhere is
 * what keeps that from coming back.
 *
 * The strip passes `window={false}`: three of these sit side by side in a
 * third of a phone's width each, and "since 22 Jul" does not fit. The window
 * is not lost, it is on the card the slot opens.
 */
export const DeltaChip = memo(function DeltaChip({
  delta,
  window = true,
  scale = 1.15,
}: {
  delta: CardDelta;
  /** Print the period the move was measured over. Off where there is no room. */
  window?: boolean;
  scale?: number;
}) {
  const tone = moveTone(delta);
  return (
    <View style={styles.delta}>
      {delta.direction !== 'flat' ? (
        // The caret is an icon-font glyph a screen reader announces as an
        // empty element; the direction it draws is spoken with the number.
        <View
          style={styles.deltaCaret}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name={delta.direction === 'up' ? 'caret-up' : 'caret-down'} size="sm" tone={tone} />
        </View>
      ) : null}
      {/* Semibold tabular type makes the move readable *as a number* inside a
          mixed metadata row. Set like the regular unit or small-caps window,
          it disappears into them and defeats the point of taking the move out
          of a sentence. */}
      <Text
        variant="tabularEmphasis"
        tone={tone}
        scale={scale}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        accessibilityLabel={
          delta.direction === 'flat' ? delta.magnitude : `${delta.direction} ${delta.magnitude}`
        }
      >
        {delta.magnitude}
      </Text>
      {/* Plain caption, the same register as the unit on the other side of
          the dot. This was small caps, which put the window in the kicker's
          register and made the row three type treatments wide — regular,
          semibold, caps — for four words. Two now: quiet text, and the one
          coloured number the row exists to show. */}
      {window && delta.window ? (
        <Text variant="caption" tone="secondary" style={styles.deltaWindow}>
          {delta.window}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // `sm`, not `xs`: the magnitude is semibold and the window beside it is
  // regular, and at a 4pt gap the two read as one word ("33%since Jul 7").
  // The same gap the unit keeps from the dot, so the row has one rhythm.
  delta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // The caret's glyph box centres on the line box, but the caps and figures
  // beside it sit in the upper half of theirs, so a centred triangle reads
  // low. One point up is the whole correction.
  // Pulled back against the gap above: the caret and the number it points at
  // are one unit and must not sit as far apart as the number and its window.
  deltaCaret: { marginBottom: 1, marginRight: -SPACING.xs },
  // The window is the least important half of the chip and the first thing
  // that may be dropped when the row wraps at large Dynamic Type.
  deltaWindow: { flexShrink: 1 },
});
