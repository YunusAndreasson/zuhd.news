import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useReducedMotion } from 'react-native-reanimated';
import {
  ANIMATION,
  type AppearanceMode,
  baseFontSize,
  type FontFamily,
  type FontSize,
  ICON,
  MAX_FONT_SCALE,
  type Preferences,
  SPACING,
  staggerDelay,
} from '../constants/theme';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { type PreferencesApi, usePreferences, useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import type { Article, Category } from '../types';
import { HapticPressable } from './HapticPressable';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetHandle } from './SheetHandle';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { SheetLayout } from './SheetLayout';
import { SheetSearchPage } from './SheetSearchPage';

const APP_VERSION = Constants.expoConfig?.version ?? '';

// ---------------------------------------------------------------------------
// Registries — one entry per navigable page. Each registry self-describes so
// `renderPage` can be a simple lookup rather than a switch-per-setting.
// ---------------------------------------------------------------------------

const INFO_PAGES = {
  about: {
    sections: [
      { body: 'Zuhd \u2014 the discipline of doing without what you do not need.' },
      { body: 'What happened. Why it matters. What comes next. Then stop.' },
      {
        body: 'Where a story is told from determines who is treated as a person and who as a statistic.',
      },
      { body: 'No social media, no investors, no editorial board.' },
      {
        heading: 'sources',
        body: 'Stories are compiled from hundreds of outlets across six continents, indexed by EventRegistry. A language model selects and writes each article based on geographic breadth and editorial significance.',
      },
      {
        heading: 'inclusion',
        body: 'Editorial independence determines inclusion. State-funded outlets qualify if editorially autonomous. Editorial interference disqualifies regardless of ownership.',
      },
      {
        heading: 'transparency',
        body: 'Every article lists the outlets used, their country of origin, and how each covers the story. Tap \u201cmore\u201d on any article to inspect.',
      },
      {
        heading: 'country data',
        body: 'Each country sheet surfaces ranked indicators across governance, development, science, economy, and demography. Tap any metric to see its full world ranking and source. Data is sourced from:',
        links: [
          { label: 'World Bank \u2014 data.worldbank.org', url: 'https://data.worldbank.org/' },
          { label: 'Our World in Data \u2014 ourworldindata.org', url: 'https://ourworldindata.org/' },
          { label: 'V-Dem Institute \u2014 v-dem.net', url: 'https://v-dem.net/' },
          {
            label: 'Transparency International \u2014 transparency.org',
            url: 'https://www.transparency.org/en/cpi',
          },
          { label: 'Reporters Without Borders \u2014 rsf.org', url: 'https://rsf.org/en/index' },
          { label: 'UNDP Human Development Report \u2014 hdr.undp.org', url: 'https://hdr.undp.org/' },
          { label: 'UNHCR Refugee Data \u2014 unhcr.org', url: 'https://www.unhcr.org/refugee-statistics/' },
          { label: 'REST Countries \u2014 restcountries.com', url: 'https://restcountries.com/' },
        ],
      },
    ],
  },
  privacy: {
    sections: [
      {
        body: 'No accounts. No analytics. No telemetry. No advertising. No crash reporting. No third-party SDKs.',
      },
      {
        heading: 'data collection',
        body: 'None. The app makes HTTPS requests to zuhd-news.pages.dev and receives JSON. No device identifiers, IP addresses, or usage data are logged server-side.',
      },
      {
        heading: 'local storage',
        body: 'Reading history, bookmarks, and preferences are stored on-device using AsyncStorage. This data never leaves your device.',
      },
      {
        heading: 'network requests',
        body: 'Content fetches, context briefs, and audio downloads go to Cloudflare Pages. No third-party endpoints are contacted.',
      },
      {
        heading: 'audio',
        body: 'Briefing audio is generated via Google Cloud TTS and hosted on our infrastructure. Google receives the text to synthesize; it does not receive any user data.',
      },
      {
        heading: 'notifications',
        body: 'Push tokens are stored on our server to deliver alerts. No other identifying information is collected alongside the token.',
      },
    ],
  },
  contact: {
    sections: [
      {
        body: 'Questions, corrections, or feedback.',
        link: { label: 'contact@zuhd.news', url: 'mailto:contact@zuhd.news' },
      },
    ],
  },
} as const satisfies Record<string, { sections: InfoSection[] }>;

type InfoKey = keyof typeof INFO_PAGES;

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'small' },
  { value: 'default', label: 'default' },
  { value: 'large', label: 'large' },
];

const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'source', label: 'source sans' },
  { value: 'system', label: 'system' },
];

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: 'dark', label: 'dark' },
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
];

/**
 * One entry per setting — options plus the get/set bridge to preferences.
 * Keeps the metadata and the wiring in one place so render code stays trivial.
 */
type SettingKey = 'size' | 'font' | 'appearance' | 'haptics' | 'notifications';

interface SettingEntry {
  key: SettingKey;
  label: string;
  get: (p: Preferences) => string;
  set: (api: PreferencesApi, v: string) => void;
  /** Drill-in detail options. Omitted on `toggle` entries. */
  options?: readonly { value: string; label: string }[];
  /** Per-option absolute font size for the detail-page label — used for size previews. */
  labelFontSize?: (v: string) => number;
  /** Render as inline switch in the settings index rather than drilling into a detail page. */
  toggle?: boolean;
  /** Accessibility hint — used for toggles where no drill-in explanation exists. */
  hint?: string;
}

const SETTINGS: readonly SettingEntry[] = [
  {
    key: 'size',
    label: 'size',
    options: FONT_SIZE_OPTIONS,
    get: (p) => p.fontSize,
    set: (api, v) => api.setFontSize(v as FontSize),
    labelFontSize: (v) => baseFontSize(v as FontSize),
  },
  {
    key: 'font',
    label: 'font',
    options: FONT_FAMILY_OPTIONS,
    get: (p) => p.fontFamily,
    set: (api, v) => api.setFontFamily(v as FontFamily),
  },
  {
    key: 'appearance',
    label: 'appearance',
    options: APPEARANCE_OPTIONS,
    get: (p) => p.appearance,
    set: (api, v) => api.setAppearance(v as AppearanceMode),
  },
  {
    key: 'haptics',
    label: 'haptics',
    get: (p) => (p.haptics ? 'on' : 'off'),
    set: (api, v) => api.setHaptics(v === 'on'),
    toggle: true,
  },
  {
    key: 'notifications',
    label: 'notifications',
    hint: 'Briefing ready and breaking news alerts',
    get: (p) => (p.notifications ? 'on' : 'off'),
    set: (api, v) => api.setNotifications(v === 'on'),
    toggle: true,
  },
];

type PageKey = InfoKey | 'settings' | SettingKey | 'search' | 'saved';

const isInfoKey = (k: PageKey): k is InfoKey => k in INFO_PAGES;

/** Pages that need a fixed tall snap (keyboard or long scrolling list). */
const TALL_PAGES: ReadonlySet<PageKey> = new Set(['search', 'saved']);

// ---------------------------------------------------------------------------
// Navigation row — shared by root menu and settings index
// ---------------------------------------------------------------------------

function NavRow({
  label,
  value,
  hint,
  first,
  onPress,
}: {
  label: string;
  value?: string;
  hint?: string;
  /** Suppresses the top hairline separator on the first row in a stack. */
  first?: boolean;
  onPress: () => void;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  return (
    <HapticPressable
      onPress={onPress}
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, currently ${value}` : label}
      accessibilityHint={hint}
    >
      <Text style={[textStyles.smallCapsBase, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value && (
          <Text
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              color: colors.textSecondary,
            }}
          >
            {value}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={ICON.sm} color={colors.textSecondary} />
      </View>
    </HapticPressable>
  );
}

function ToggleRow({
  label,
  value,
  hint,
  first,
  onChange,
}: {
  label: string;
  value: boolean;
  hint?: string;
  /** Suppresses the top hairline separator on the first row in a stack. */
  first?: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors, textStyles } = useTheme();
  const handleChange = useCallback(
    (v: boolean) => {
      hapticTick();
      onChange(v);
    },
    [onChange],
  );
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessible
      accessibilityRole="switch"
    >
      <Text style={[textStyles.smallCapsBase, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={handleChange}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: colors.rule, true: colors.textSecondary }}
        ios_backgroundColor={colors.rule}
      />
    </View>
  );
}

/** Inline radiogroup — label + horizontal options on one settings row.
 *  Replaces the drill-in + detail-page flow for single-select settings,
 *  matching native iOS/Android grouped-settings expectations. */
function InlineOptionRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
  labelFontSize,
  first,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
  /** Per-option absolute font size — used for size previews. */
  labelFontSize?: (v: T) => number;
  first?: boolean;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  return (
    <View
      style={[
        styles.inlineOptionRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      <Text style={[textStyles.smallCapsBase, { color: colors.text }]}>{label}</Text>
      <View style={styles.inlineOptions}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <HapticPressable
              key={opt.value}
              onPress={() => {
                if (!active) onSelect(opt.value);
              }}
              haptic="tick"
              hitSlop={8}
              style={styles.inlinePill}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: labelFontSize?.(opt.value) ?? typography.sizeSm,
                  color: active ? colors.textEmphasis : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </HapticPressable>
          );
        })}
      </View>
    </View>
  );
}

function ActionLink({
  label,
  hint,
  first,
  onPress,
}: {
  label: string;
  hint?: string;
  /** Suppresses the top hairline separator on the first row in a stack. */
  first?: boolean;
  onPress: () => void;
}) {
  const { colors, font, typography } = useTheme();
  return (
    <HapticPressable
      onPress={onPress}
      style={[
        styles.actionRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={{ ...font.semiBold, fontSize: typography.sizeSm, color: colors.text }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={ICON.sm} color={colors.textSecondary} />
    </HapticPressable>
  );
}

// ---------------------------------------------------------------------------
// MenuSheet
// ---------------------------------------------------------------------------

interface MenuSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  grouped: Record<Category, Article[]>;
  onSelectArticle: (slug: string, category: Category) => void;
  onToast?: (message: string) => void;
}

export const MenuSheet = memo(function MenuSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onDismiss,
  grouped,
  onSelectArticle,
  onToast,
}: MenuSheetProps) {
  const { colors, font, typography, sheetStyles } = useTheme();
  const prefsApi = usePreferences();
  const { preferences } = prefsApi;
  const nav = useSheetNavigation<PageKey>();
  const [canRate, setCanRate] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Wrap push/pop with VoiceOver/TalkBack announcements so users hear what
  // page they're on after a transition — matches native navigation-stack UX.
  const navPush = useCallback(
    (page: PageKey) => {
      nav.push(page);
      AccessibilityInfo.announceForAccessibility(page);
    },
    [nav.push],
  );
  const navPop = useCallback(() => {
    nav.pop();
    const next = nav.stack[nav.stack.length - 2];
    AccessibilityInfo.announceForAccessibility(next ?? 'menu');
  }, [nav.pop, nav.stack]);

  useEffect(() => {
    StoreReview.hasAction()
      .then(setCanRate)
      .catch(() => {});
  }, []);
  const isTall = nav.current !== null && TALL_PAGES.has(nav.current);
  const snapProps = useSheetSnaps(isTall);

  const Handle = useCallback(
    () => (
      <SheetHandle title={nav.current ?? undefined} onBack={nav.depth > 0 ? navPop : undefined} />
    ),
    [nav.current, nav.depth, navPop],
  );

  const handleDismiss = useCallback(() => {
    nav.reset();
    setIsOpen(false);
    onDismiss();
  }, [onDismiss, nav.reset]);

  // Track open state so the Android back handler registers only while visible.
  const handleSheetChange = useCallback((index: number) => {
    setIsOpen(index >= 0);
  }, []);

  // Android hardware back: pop the nav stack first, dismiss only at root.
  // Registered only while the sheet is open so we don't swallow back presses
  // elsewhere in the app.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (nav.depth > 0) {
        navPop();
        return true;
      }
      sheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, nav.depth, navPop, sheetRef]);

  // Swipe-back — horizontal pan on a sub-page pops one level.
  // `activeOffsetX(20)` + `failOffsetY(±10)` prevents stealing the sheet's
  // vertical pan-to-close or the inner ScrollView's vertical scroll.
  const swipeBack = Gesture.Pan()
    .enabled(nav.depth > 0)
    .activeOffsetX(20)
    .failOffsetY([-10, 10])
    .onEnd(({ translationX, velocityX }) => {
      'worklet';
      if (translationX > 80 || velocityX > 800) {
        runOnJS(navPop)();
      }
    });

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      enableOverDrag={false}
      renderBackdrop={renderBackdrop}
      handleComponent={Handle}
      onDismiss={handleDismiss}
      onChange={handleSheetChange}
      keyboardBehavior="extend"
      keyboardBlurBehavior="none"
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize"
    >
      {nav.current === 'search' ? (
        <SheetSearchPage
          grouped={grouped}
          bottomInset={bottomInset}
          onSelectArticle={onSelectArticle}
        />
      ) : (
        <GestureDetector gesture={swipeBack}>
          <BottomSheetScrollView
            contentContainerStyle={[
              sheetStyles.content,
              { paddingBottom: bottomInset + SPACING.xxl },
            ]}
          >
            {renderPage()}
          </BottomSheetScrollView>
        </GestureDetector>
      )}
    </SheetLayout>
  );

  function renderPage() {
    const current = nav.current;
    if (current === null) {
      return (
        <>
          <Text
            style={[styles.wordmark, { letterSpacing: typography.trackingWordmark }]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
            accessibilityRole="header"
            accessibilityLabel="zuhd.news"
          >
            <Text
              style={{
                ...font.bold,
                fontSize: typography.sizeWordmark,
                color: colors.textSecondary,
              }}
            >
              zuhd
            </Text>
            <Text
              style={{
                ...font.regular,
                fontSize: typography.sizeWordmark,
                color: colors.accent,
              }}
            >
              .news
            </Text>
          </Text>

          <NavRow
            first
            label="search"
            hint="Search all articles by title, topic, or location"
            onPress={() => navPush('search')}
          />
          <NavRow label="saved" hint="Your bookmarked articles" onPress={() => navPush('saved')} />
          <NavRow
            label="settings"
            hint="Appearance, text size, haptics, notifications"
            onPress={() => navPush('settings')}
          />

          <View style={[styles.divider, { backgroundColor: colors.rule }]} />

          <View style={styles.infoLinks}>
            <ActionLink first label="about" onPress={() => navPush('about')} />
            <ActionLink label="privacy" onPress={() => navPush('privacy')} />
            <ActionLink label="contact" onPress={() => navPush('contact')} />
            {canRate && (
              <ActionLink
                label="rate"
                hint="Rate zuhd.news in the App Store"
                onPress={() => {
                  StoreReview.requestReview().catch(() => {});
                }}
              />
            )}
          </View>
        </>
      );
    }

    if (current === 'settings') {
      return SETTINGS.map((s, i) => {
        const currentValue = s.get(preferences);
        // Skip stagger animation when the OS has Reduce Motion enabled.
        const entering = reduceMotion
          ? undefined
          : FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i));
        const row = s.toggle ? (
          <ToggleRow
            first={i === 0}
            label={s.label}
            value={currentValue === 'on'}
            hint={s.hint}
            onChange={(v) => {
              if (s.key === 'notifications' && v) {
                prefsApi.setNotifications(true).then((granted) => {
                  if (!granted) onToast?.('Enable notifications in Settings');
                });
              } else {
                s.set(prefsApi, v ? 'on' : 'off');
              }
            }}
          />
        ) : s.options ? (
          <InlineOptionRow
            first={i === 0}
            label={s.label}
            options={s.options}
            selected={currentValue}
            onSelect={(v) => s.set(prefsApi, v)}
            labelFontSize={s.labelFontSize}
          />
        ) : null;
        return (
          <Animated.View key={s.key} entering={entering}>
            {row}
          </Animated.View>
        );
      });
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (isInfoKey(current)) {
      return (
        <>
          <SheetInfoPage sections={INFO_PAGES[current].sections} />
          {current === 'about' && (
            <Text
              style={{
                ...font.regular,
                fontSize: typography.sizeXs,
                color: colors.textSecondary,
                marginTop: SPACING.lg,
              }}
            >
              {APP_VERSION}
            </Text>
          )}
        </>
      );
    }

    return null;
  }
});

const styles = StyleSheet.create({
  wordmark: {
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.smPlus,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.sm,
  },
  infoLinks: {
    // Stacked vertically for easier tapping. Keeps lowercase styling to read
    // as secondary / editorial links, distinct from the capitalised NavRows.
  },
  inlineOptionRow: {
    paddingVertical: SPACING.smPlus,
  },
  inlineOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  inlinePill: {
    paddingVertical: SPACING.xs,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.smPlus,
  },
});
