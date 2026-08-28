import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HIT_SLOP,
  LAYOUT,
  MAX_FONT_SCALE,
  OPACITY,
  PRESSED_STYLE,
  SECTIONS,
  SPACING,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, IconButton } from './primitives';

// Lowercase strings render via the dedicated small-caps font (SourceSans3SC),
// matching the labelSm/labelXs treatment used by every other small-caps
// surface (BottomActionBar pills, sheet titles). Uppercasing here would
// route uppercase glyphs through the small-caps font, which renders them
// as full caps and breaks the editorial smallcaps voice.
//
// Four labels fit. "news prices money outlook" leaves enough room for the
// type, gaps, group rule and menu reserve on a 360pt phone, so the row
// padding and the menu reserve are counted — against a 360–430pt phone, so the
// whole axis is visible at once and the rail can finally do the one job a rail
// has. It was six ("news markets crypto metals currencies predictions", past
// 440pt of type alone), which forced a scroller and meant the reader could
// never see where the axis ended.
//
// `prices` names the reader's question rather than the data provider's asset
// class. Its contents answer what food, fuel and metals cost; `money` answers
// what currencies and borrowing are worth.
//
// The scroller stays anyway, for large Dynamic Type: `MAX_FONT_SCALE.chrome`
// still allows growth past the width, and the auto-scroll effect below is a
// no-op while the content fits. Abbreviating was never the alternative — the
// labels are the sections' names and a reader should not have to decode
// "curr".
//
// `news` is set off by a rule. It is a river of forty articles; the other
// three are decks of four to seven cards, and presenting all four as
// identical peers was a claim about symmetry the content does not keep.
//
// This does not make the rail the navigation. Swiping the page is; the rail is
// where you are, and it happens to accept a tap.
const TAB_LABELS: string[] = [...SECTIONS];
const TAB_INDICES = TAB_LABELS.map((_, i) => i);

interface TabLayout {
  x: number;
  width: number;
}

interface SectionBarProps {
  pagerOffset: SharedValue<number>;
  /** Scroll depth within each section, one slot per section. Drives the fill
   *  under the active label, so the rail says where you are on both axes. */
  sectionProgresses: SharedValue<number[]>;
  currentSection: number;
  onSectionPress: (index: number) => void;
  onMenuPress: () => void;
}

function TabLabel({
  label,
  index,
  pagerOffset,
  isSelected,
  labelStyle,
  onSectionPress,
  onLayout,
}: {
  label: string;
  index: number;
  pagerOffset: SharedValue<number>;
  isSelected: boolean;
  labelStyle: TextStyle;
  onSectionPress: (index: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const handlePress = useCallback(() => onSectionPress(index), [onSectionPress, index]);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const distance = Math.abs(pagerOffset.value - index);
    // 0.5 floor: inactive tabs must stay present as primary navigation —
    // at the previous 0.4 they sank into the dark bg and read as chrome
    // rather than destinations. Still clearly secondary to the active tab.
    const opacity = interpolate(distance, [0, 1], [1, 0.5], 'clamp');
    return { color: labelStyle.color, opacity };
  });

  return (
    <Pressable
      onPress={handlePress}
      onLayout={onLayout}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => pressed && PRESSED_STYLE}
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
    >
      <Animated.Text
        style={[labelStyle, animatedStyle]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

export const SectionBar = memo(function SectionBar({
  pagerOffset,
  sectionProgresses,
  currentSection,
  onSectionPress,
  onMenuPress,
}: SectionBarProps) {
  const { colors, textVariants } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [tabLayouts, setTabLayouts] = useState<TabLayout[]>([]);
  const layoutsRef = useRef<(TabLayout | null)[]>(new Array(TAB_LABELS.length).fill(null));
  const allMeasured = tabLayouts.length === TAB_LABELS.length;

  const handleTabLayout = useCallback((index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layoutsRef.current[index] = { x, width };
    const layouts = layoutsRef.current;
    if (layouts.every((l): l is TabLayout => l !== null)) {
      setTabLayouts([...layouts]);
    }
  }, []);

  const tabLayoutHandlers = useMemo(
    () => TAB_LABELS.map((_, i) => (e: LayoutChangeEvent) => handleTabLayout(i, e)),
    [handleTabLayout],
  );

  // These two arrays are built HERE and not inside the worklet below, and that
  // is load-bearing rather than tidiness. `tabLayouts.map((l) => l.x)` written
  // inside `useAnimatedStyle` puts an arrow function in an auto-workletized
  // body; the Babel plugin does not workletize a callback handed to an array
  // method, so it is serialized as a Remote Function. react-native-worklets
  // throws the moment the UI runtime calls one synchronously:
  //
  //   [Worklets] Tried to synchronously call a Remote Function.
  //   Called "…" on the UI Runtime.
  //
  // Uncaught on the UI runtime that is std::terminate -> SIGABRT, which is the
  // ~0.4s-after-launch abort in TestFlight builds 288, 289 and 292. The code is
  // unchanged since the app's first commit; what changed is that worklets made
  // this a hard error, so it went from silently working to fatal on upgrade.
  // Hoisting also stops both arrays being rebuilt on every frame.
  const tabXs = useMemo(() => tabLayouts.map((l) => l.x), [tabLayouts]);
  const tabWidths = useMemo(() => tabLayouts.map((l) => l.width), [tabLayouts]);

  // Keep the label you are on inside the window. Centred where there is room,
  // clamped at both ends so the first and last sections do not float in from
  // the middle of an empty rail.
  //
  // Driven from `currentSection` (a settled page) rather than from
  // `pagerOffset` (a finger): a rail that slides continuously under a
  // horizontal drag fights the drag, and the indicator already tracks the
  // finger — that is the part that should feel live.
  useEffect(() => {
    const tab = tabLayouts[currentSection];
    if (!tab) return;
    const usable = screenWidth - SPACING.articlePadding * 2 - MENU_RESERVE;
    const target = tab.x + tab.width / 2 - usable / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: true });
  }, [currentSection, tabLayouts, screenWidth]);

  // Track: interpolated (smooth slide). Fill: snapped (both left + width from same index).
  const trackPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };
    const x = interpolate(pagerOffset.value, TAB_INDICES, tabXs, 'clamp');
    const w = interpolate(pagerOffset.value, TAB_INDICES, tabWidths, 'clamp');
    return { left: x, width: w, opacity: OPACITY.soft };
  });

  const fillPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };

    const currentIdx = Math.min(Math.round(Math.max(0, pagerOffset.value)), tabLayouts.length - 1);
    const tab = tabLayouts[currentIdx];
    const progress = sectionProgresses.value[currentIdx] ?? 0;

    return { left: tab?.x ?? 0, width: (tab?.width ?? 0) * progress, opacity: 1 };
  });

  // Reuse the `labelXs` variant verbatim (same small-caps font, size, and
  // caps tracking) rather than re-assembling it by hand; only the color
  // differs — tabs read at full `text`, not the variant's `textSecondary`.
  const labelStyle: TextStyle = { ...textVariants.labelXs, color: colors.text };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <View style={styles.bar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Without an explicit flex the scroller measures to its content and
          // runs straight under the menu button, which then sits on top of the
          // last label. `flex: 1` gives it the row minus the button.
          style={styles.scroller}
          contentContainerStyle={styles.tabRow}
          // The rail is a readout, not a second way to travel. Letting it
          // rubber-band would read as a failed page swipe.
          bounces={false}
          overScrollMode="never"
        >
          {TAB_LABELS.map((label, i) => (
            <Fragment key={label}>
              {/* The rule after `news`. It sits between two Pressables rather
                  than inside either, so every label still measures its own
                  `x` against the content container and the indicator maths
                  below is untouched — the rule just moves the three that
                  follow it along, which is the intended reading. The row's
                  `gap` supplies the breathing on both sides, so the group
                  break is 33pt against 16pt between peers. */}
              {i === GROUP_BREAK ? (
                <View style={[styles.groupRule, { backgroundColor: colors.rule }]} />
              ) : null}
              <TabLabel
                label={label}
                index={i}
                pagerOffset={pagerOffset}
                isSelected={currentSection === i}
                labelStyle={labelStyle}
                onSectionPress={onSectionPress}
                onLayout={tabLayoutHandlers[i] ?? (() => {})}
              />
            </Fragment>
          ))}
          <Animated.View
            style={[styles.progressBar, { backgroundColor: colors.textEmphasis }, trackPos]}
          />
          <Animated.View
            style={[styles.progressBar, { backgroundColor: colors.textEmphasis }, fillPos]}
          />
        </ScrollView>
        {/* Outside the scroller: the menu is chrome, and chrome that slides
            away when you swipe the rail is chrome you cannot find. */}
        <IconButton onPress={onMenuPress} accessibilityLabel="Menu" style={styles.menuButton}>
          <Icon name="menu" size="md" />
        </IconButton>
      </View>
    </View>
  );
});

/** Width kept clear on the right for the menu button, so the auto-scroll
 *  centres a label in the space it can actually occupy. */
const MENU_RESERVE = 36;

/** The rule goes before this index — i.e. after `news`, which is the only
 *  section that is a river of articles rather than a deck of cards. Derived
 *  rather than written as `1` so that moving `news` off the left edge moves
 *  the rule with it. */
const GROUP_BREAK = SECTIONS.indexOf('news') + 1;

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    paddingBottom: SPACING.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.articlePadding,
  },
  scroller: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Aligned with the article reader's column — `articlePadding` mirrors
    // the body's horizontal inset so the small-caps labels visually line up
    // with the title's first character. Left: +2 optical compensation
    // because the small-caps side-bearings are tighter than H1 body text;
    // matching the inset exactly makes the row look outdented. Right: raw
    // `articlePadding` (the menu glyph's own sidebearing reads flush).
    paddingLeft: SPACING.articlePadding + 2,
    paddingRight: SPACING.articlePadding,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    // `md`, not `lg`: six labels need the width back, and the small-caps
    // tracking already keeps adjacent words from touching.
    gap: SPACING.md,
  },
  // A full point, not `hairlineWidth`. A hairline is the right weight for a
  // horizontal rule spanning a card, and it is what vanishes at some Android
  // densities when it is 10pt of vertical line instead — and a group rule
  // nobody can see is a group rule that does not group.
  groupRule: {
    width: 1,
    // Roughly the cap height of the small-caps labels beside it, so the rule
    // reads as part of the same line rather than as a divider dropped over it.
    height: 10,
  },
  menuButton: {
    marginLeft: 'auto',
    // Pull icon up ~1px so its optical center lines up with the small-caps
    // labels' x-height rather than the row's geometric midline.
    transform: [{ translateY: -1 }],
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    height: LAYOUT.progressBarHeight,
    borderRadius: LAYOUT.progressBarHeight,
  },
});
