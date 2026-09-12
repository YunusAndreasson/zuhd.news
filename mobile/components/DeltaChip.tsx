import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import type { CardDelta } from '../lib/cards/types';
import { Icon, Text } from './primitives';

/**
 * Which way the number went, and what that does to the person reading.
 *
 * Two channels on purpose (see `CardDelta`): the caret says the direction, the
 * colour says the consequence. Both are always present, and the colour is a
 * three-value channel rather than a two-value one that is sometimes absent —
 * a card about the price of oil gets a caret in rose, a card about bitcoin
 * gets one in slate, and slate is the app saying it will not tell you whether
 * that is good news. The near-white fallback this used to take is gone: it was
 * indistinguishable from the label text beside it, so the reader's first job
 * was deciding whether a chip was coloured at all.
 *
 * Shared rather than copied. It lived inside `CardFrame` until the indicator
 * strip needed the same two channels above the globe, and a strip drawing its
 * own caret is how the app ends up with two answers to "which way is bad" —
 * the exact failure `lib/valence.ts` was created to end.
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
  const tone = delta.valence;
  return (
    <View style={styles.delta}>
      {delta.direction !== 'flat' ? (
        <View style={styles.deltaCaret}>
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
