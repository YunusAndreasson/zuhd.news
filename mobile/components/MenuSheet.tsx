import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { Article, Category } from '@shared/types';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Text as RNText,
  StyleSheet,
  Switch,
  type TextStyle,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { IS_ANDROID } from '../constants/platform';
import {
  ANIMATION,
  type AppearanceMode,
  baseFontSize,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSize,
  type Preferences,
  SPACING,
  staggerDelay,
} from '../constants/theme';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { type PreferencesApi, usePreferences, useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { Icon, Pressable, Text } from './primitives';
import { SheetAboutPage } from './SheetAboutPage';
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
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

type SettingKey = 'size' | 'font' | 'appearance' | 'haptics' | 'notifications';

interface SettingEntry {
  key: SettingKey;
  label: string;
  get: (p: Preferences) => string;
  set: (api: PreferencesApi, v: string) => void;
  options?: readonly { value: string; label: string }[];
  /** Per-option absolute font size for the detail-page label — used for size previews. */
  labelFontSize?: (v: string) => number;
  /** Per-option style override merged onto the option pill — used for font-family previews. */
  labelStyle?: (v: string) => TextStyle;
  toggle?: boolean;
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
    // Render each option pill in its own family so the picker is WYSIWYG.
    labelStyle: (v) => (v === 'source' ? FONT_SOURCE.semiBold : FONT_SYSTEM.semiBold),
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

type PageKey = InfoKey | 'about' | 'settings' | SettingKey | 'search' | 'saved';

const isInfoKey = (k: PageKey): k is InfoKey => k in INFO_PAGES;

const TALL_PAGES: ReadonlySet<PageKey> = new Set(['search', 'saved']);

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
  first?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, currently ${value}` : label}
      accessibilityHint={hint}
    >
      <Text variant="label" tone="default">
        {label}
      </Text>
      <View style={styles.rowRight}>
        {value && <Text variant="caption">{value}</Text>}
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      </View>
    </Pressable>
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
  first?: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
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
      <View style={styles.rowText}>
        <Text variant="label" tone="default">
          {label}
        </Text>
        {hint && (
          <Text variant="caption" style={styles.hint}>
            {hint}
          </Text>
        )}
      </View>
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

/** Inline radiogroup — label + horizontal options on one settings row. */
function InlineOptionRow<T extends string>({
  label,
  hint,
  options,
  selected,
  onSelect,
  labelFontSize,
  labelStyle,
  first,
}: {
  label: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
  /** Per-option absolute font size — used for size previews. */
  labelFontSize?: (v: T) => number;
  /** Per-option style override merged onto the option pill — used for font-family previews. */
  labelStyle?: (v: T) => TextStyle;
  first?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={[
        styles.inlineOptionRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text variant="label" tone="default">
        {label}
      </Text>
      {hint && (
        <Text variant="caption" style={styles.hint}>
          {hint}
        </Text>
      )}
      <View style={styles.inlineOptions}>
        {options.map((opt) => {
          const active = opt.value === selected;
          // Option pills in the size setting render at their *actual* target
          // font size (live preview), so they need dynamic scaling not in a
          // fixed variant. All other option pills use the default caption size.
          const pillScale = labelFontSize ? labelFontSize(opt.value) / typography.sizeSm : 1;
          const pillStyle = labelStyle ? labelStyle(opt.value) : undefined;
          return (
            <Pressable
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
                variant="captionEmphasis"
                tone={active ? 'emphasis' : 'secondary'}
                scale={pillScale}
                style={pillStyle}
              >
                {opt.label}
              </Text>
            </Pressable>
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
  first?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.actionRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text variant="captionEmphasis">{label}</Text>
      <Icon name="chevron-forward" size="sm" tone="secondary" />
    </Pressable>
  );
}

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
  const { colors, font, sheetStyles } = useTheme();
  const prefsApi = usePreferences();
  const { preferences } = prefsApi;
  const nav = useSheetNavigation<PageKey>();
  const [canRate, setCanRate] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

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

  const handleSheetChange = useCallback((index: number) => {
    setIsOpen(index >= 0);
  }, []);

  useEffect(() => {
    if (!IS_ANDROID || !isOpen) return;
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
              { paddingBottom: bottomInset + SPACING.lg },
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
          {/* Wordmark: composite with mixed weights/colors per glyph cluster.
              Outer sets size + tracking via `wordmark` variant; inner fragments
              override font family and color only — a one-off brand lockup. */}
          <Text
            variant="wordmark"
            accessibilityRole="header"
            accessibilityLabel="zuhd.news"
            style={styles.wordmark}
          >
            <RNText style={{ ...font.bold, color: colors.textSecondary }}>zuhd</RNText>
            <RNText style={{ ...font.regular, color: colors.accent }}>.news</RNText>
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
      return (
        <>
          {SETTINGS.map((s, i) => {
            const currentValue = s.get(preferences);
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
                      if (!granted) {
                        onToast?.('Enable notifications in Settings');
                        Linking.openSettings().catch(() => {});
                      }
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
                hint={s.hint}
                options={s.options}
                selected={currentValue}
                onSelect={(v) => s.set(prefsApi, v)}
                labelFontSize={s.labelFontSize}
                labelStyle={s.labelStyle}
              />
            ) : null;
            return (
              <Animated.View key={s.key} entering={entering}>
                {row}
              </Animated.View>
            );
          })}
          {APP_VERSION ? (
            <Text variant="caption" style={styles.versionFooter}>
              {APP_VERSION}
            </Text>
          ) : null}
        </>
      );
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (current === 'about') {
      const allArticles = Object.values(grouped).flat();
      return (
        <>
          <SheetAboutPage articles={allArticles} />
          <Text variant="caption" style={{ marginTop: SPACING.lg }}>
            {APP_VERSION}
          </Text>
        </>
      );
    }

    if (isInfoKey(current)) {
      return <SheetInfoPage sections={INFO_PAGES[current].sections} />;
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
    gap: SPACING.md,
  },
  rowText: {
    flex: 1,
  },
  hint: {
    marginTop: SPACING.xxs,
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
  infoLinks: {},
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
  versionFooter: {
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
});
