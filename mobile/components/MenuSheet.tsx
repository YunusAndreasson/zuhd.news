import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ANIMATION,
  type AppearanceMode,
  baseFontSize,
  type FontFamily,
  type FontSize,
  ICON,
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
import { SheetOptionPage } from './SheetOptionPage';
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
        body: 'Hundreds of sources across six continents, selected for editorial independence. Where a story is told from determines who is treated as a person and who as a statistic.',
      },
      { body: 'No social media, no investors, no editorial board.' },
      { link: { label: 'zuhd.news', url: 'https://zuhd.news' }, body: '' },
    ],
  },
  sources: {
    sections: [
      {
        body: 'Stories are compiled from hundreds of outlets indexed by EventRegistry. A language model selects and writes each article based on geographic breadth and editorial significance.',
      },
      {
        heading: 'inclusion',
        body: 'Editorial independence determines inclusion. State-funded outlets qualify if editorially autonomous. Editorial interference disqualifies regardless of ownership.',
      },
      {
        heading: 'transparency',
        body: 'Every article lists the outlets used, their country of origin, and how each covers the story. Tap \u201cmore\u201d on any article to inspect.',
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
const findSetting = (k: PageKey): SettingEntry | undefined => SETTINGS.find((s) => s.key === k);

/** Pages that need a fixed tall snap (keyboard or long scrolling list). */
const TALL_PAGES: ReadonlySet<PageKey> = new Set(['search', 'saved']);

// ---------------------------------------------------------------------------
// Navigation row — shared by root menu and settings index
// ---------------------------------------------------------------------------

function NavRow({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value?: string;
  hint?: string;
  onPress: () => void;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  return (
    <HapticPressable
      onPress={onPress}
      style={styles.row}
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
  onChange,
}: {
  label: string;
  value: boolean;
  hint?: string;
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
    <View style={styles.row} accessible accessibilityRole="switch">
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

function ActionLink({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const { colors, font, typography } = useTheme();
  return (
    <HapticPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={{ ...font.semiBold, fontSize: typography.sizeSm, color: colors.text }}>
        {label}
      </Text>
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

  useEffect(() => {
    StoreReview.hasAction()
      .then(setCanRate)
      .catch(() => {});
  }, []);
  const isTall = nav.current !== null && TALL_PAGES.has(nav.current);
  const snapProps = useSheetSnaps(isTall);

  const Handle = useCallback(
    () => (
      <SheetHandle title={nav.current ?? undefined} onBack={nav.depth > 0 ? nav.pop : undefined} />
    ),
    [nav.current, nav.depth, nav.pop],
  );

  const handleDismiss = useCallback(() => {
    nav.reset();
    onDismiss();
  }, [onDismiss, nav.reset]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      enableOverDrag={false}
      renderBackdrop={renderBackdrop}
      handleComponent={Handle}
      onDismiss={handleDismiss}
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
        <BottomSheetScrollView
          contentContainerStyle={[
            sheetStyles.content,
            { paddingBottom: bottomInset + SPACING.xxl },
          ]}
        >
          {renderPage()}
        </BottomSheetScrollView>
      )}
    </SheetLayout>
  );

  function renderPage() {
    const current = nav.current;
    if (current === null) {
      return (
        <>
          <NavRow
            label="search"
            hint="Search all articles by title, topic, or location"
            onPress={() => nav.push('search')}
          />
          <NavRow label="saved" hint="Your bookmarked articles" onPress={() => nav.push('saved')} />
          <NavRow
            label="settings"
            hint="Appearance, text size, haptics, notifications"
            onPress={() => nav.push('settings')}
          />

          <View style={[styles.divider, { backgroundColor: colors.rule }]} />

          <View style={styles.infoLinks}>
            <ActionLink label="about" onPress={() => nav.push('about')} />
            <ActionLink label="sources" onPress={() => nav.push('sources')} />
            <ActionLink label="privacy" onPress={() => nav.push('privacy')} />
            <ActionLink label="contact" onPress={() => nav.push('contact')} />
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

          <Text
            style={{
              ...font.regular,
              fontSize: typography.sizeXs,
              color: colors.textSecondary,
              marginTop: SPACING.lg,
            }}
          >
            zuhd.news · {APP_VERSION}
          </Text>
        </>
      );
    }

    if (current === 'settings') {
      return SETTINGS.map((s, i) => {
        const currentValue = s.get(preferences);
        return (
          <Animated.View
            key={s.key}
            entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
          >
            {s.toggle ? (
              <ToggleRow
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
            ) : (
              <NavRow
                label={s.label}
                value={s.options?.find((o) => o.value === currentValue)?.label ?? currentValue}
                onPress={() => nav.push(s.key)}
              />
            )}
          </Animated.View>
        );
      });
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (isInfoKey(current)) {
      return <SheetInfoPage sections={INFO_PAGES[current].sections} />;
    }

    const setting = findSetting(current);
    if (setting?.options) {
      return (
        <SheetOptionPage
          options={setting.options}
          selected={setting.get(preferences)}
          onSelect={(v) => setting.set(prefsApi, v)}
          labelFontSize={setting.labelFontSize}
        />
      );
    }
    return null;
  }
});

const styles = StyleSheet.create({
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
    marginVertical: SPACING.md,
  },
  infoLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.smPlus,
  },
});
