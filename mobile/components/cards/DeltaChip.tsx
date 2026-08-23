import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import type { CardDelta } from '../../lib/cards/types';
import { Icon, Text } from '../primitives';

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
 * It lives in its own file because two surfaces draw it now — the card, and
 * the row on the column index that opens that card. A second copy is the
 * failure this repo has already paid for twice, in `EntitySheet.formatLatest`
 * and `ChokepointSheet.formatCount`: the copies look identical until one of
 * them is edited, and then the same number is described two ways one tap
 * apart.
 */
export const DeltaChip = memo(function DeltaChip({
  delta,
  compact = false,
}: {
  delta: CardDelta;
  /** Drop the window. An index row prints ten of these in a column two lines
   *  tall; "since 22 Jul" is the half of the chip that does not survive that
   *  width, and it is on the card one tap away. */
  compact?: boolean;
}) {
  const tone = delta.valence;
  return (
    <View style={styles.delta}>
      {delta.direction !== 'flat' ? (
        <View style={styles.deltaCaret}>
          <Icon name={delta.direction === 'up' ? 'caret-up' : 'caret-down'} size="sm" tone={tone} />
        </View>
      ) : null}
      {/* `tabularEmphasis` rather than the `labelSm` the rest of this row uses.
          Semibold and tabular is what makes the move readable *as a number*
          inside a run of small-caps grey label text — set in the same variant
          as its neighbours it disappeared into them, which defeated the point
          of moving it out of the sentence. */}
      <Text
        variant="tabularEmphasis"
        tone={tone}
        scale={1.15}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
      >
        {delta.magnitude}
      </Text>
      {delta.window && !compact ? (
        <Text variant="labelXs" tone="secondary" numberOfLines={1} style={styles.deltaWindow}>
          {delta.window}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // `sm`, not `xs`. The magnitude is set in a variant with no letter-spacing
  // and the window beside it is small-caps that does have some, so a 4pt gap
  // rendered as "33%SINCE JUL 7" — the two ran together and the chip stopped
  // parsing as two things.
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
