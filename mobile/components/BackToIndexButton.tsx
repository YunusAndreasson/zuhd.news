import { memo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, IconButton } from './primitives';

/**
 * The width a header line has to keep clear of the control below.
 *
 * It lives here rather than in the frame that collides with it because two
 * frames now do: `CardFrame` reserves a gutter for it on a card, and
 * `ArticlePage` would collide with it in the river. While each file held its
 * own copy of the number, a header could only stay clear of the control by
 * coincidence.
 *
 * 34pt clears the 44pt target once `HIT_SLOP` is added, which `IconButton`
 * applies for us.
 */
export const CLOSE_SIZE = 34;

/**
 * The gutter a header line keeps clear of the control.
 *
 * Both detail views reserve it. `CardFrame` has since it first drew one: the
 * control is pinned to the page rather than to the card, so on a card that
 * scrolls every line in the header travels up through it, and because the
 * control is an opaque pill a title long enough to reach the gutter does not
 * overlap it — it disappears behind it. "US-Iran ceasefire continues Aug 31?"
 * clears the pill's left edge by three thousandths of the screen; one more
 * word and the question loses its question mark, which is the one mark that
 * says the outcome is still open.
 *
 * `ArticlePage` reserves it because the river became a detail view and
 * inherited the control. The first headline it met lost a letter.
 */
export const CLOSE_GUTTER = CLOSE_SIZE + SPACING.sm;

/**
 * Back to the list a detail view was opened from.
 *
 * Every column in the app is now an index of rows, and every row opens a
 * full-screen detail — a card on the three instrument columns, an article on
 * `news`. This is the way out of all four, and it is one component so the way
 * out cannot look like two different affordances depending on which half of
 * the app a reader is standing in.
 *
 * A round target rather than a bare glyph: it floats over content that scrolls
 * under it, so the ink behind it is whatever paragraph happens to be there —
 * the same problem `BottomActionBar` has over the globe, and the same answer.
 * A low-lift `pillBg` fill with a hairline edge, because the fill alone blends
 * into a dark backdrop. Definition, not elevation; no shadow.
 *
 * Always render it as a *sibling* of the scrolling content, never a child of
 * it. `CardFrame.onContentLayout` measures its content against the page to
 * decide whether an inner scroll arms at all, and a control inside that view
 * would add its own height to the comparison — the measurement that once let
 * four cards truncate in silence.
 */
/**
 * One name for the exit, and it is not a prop.
 *
 * Two controls do this now — this one and `close` in `BottomActionBar` — and
 * the moment a call site could rename its own, they disagreed: the river's
 * corner said "Back to the headlines" and the pill under it said "Back to the
 * list". A screen reader announced one action twice, under two names, on one
 * screen. The app's rule about one name per thing is not only about visible
 * strings.
 */
const BACK_LABEL = 'Back to the list';

export const BackToIndexButton = memo(function BackToIndexButton({
  onPress,
  style,
}: {
  onPress: () => void;
  /** Placement only. The size, radius and hairline are fixed here. */
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <IconButton
      onPress={onPress}
      accessibilityLabel={BACK_LABEL}
      style={[styles.button, { backgroundColor: colors.pillBg, borderColor: colors.rule }, style]}
    >
      <Icon name="close-sharp" size="md" tone="secondary" />
    </IconButton>
  );
});

const styles = StyleSheet.create({
  // Level with the kicker: `SPACING.md` is the card column's own `paddingTop`
  // in `CardFrame`, and `articlePadding` its horizontal inset, so the control
  // sits on the content's grid rather than floating over it. `ArticlePage`
  // uses the same two tokens for its own header.
  button: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.articlePadding,
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
