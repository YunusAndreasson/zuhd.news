import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type AppearanceMode, type FontFamily, type FontSize, SPACING } from '../constants/theme';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { usePreferences, useTheme } from '../hooks/useTheme';
import type { Article, Category } from '../types';
import { HapticPressable } from './HapticPressable';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetHandle } from './SheetHandle';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { SheetLayout } from './SheetLayout';
import { SheetOptionPage } from './SheetOptionPage';
import { SheetSearchPage } from './SheetSearchPage';

// ---------------------------------------------------------------------------
// Page registry — one entry per navigable page. `title` drives the handle,
// `render` is called with the nav + preferences the page needs.
// ---------------------------------------------------------------------------

type InfoKey = 'about' | 'sources' | 'privacy' | 'contact';
type SettingKey = 'size' | 'font' | 'appearance' | 'haptics' | 'notifications';
type PageKey = InfoKey | 'settings' | SettingKey | 'search' | 'saved';

const INFO_KEYS: ReadonlySet<PageKey> = new Set(['about', 'sources', 'privacy', 'contact']);
const SETTING_KEYS: ReadonlySet<PageKey> = new Set([
  'size',
  'font',
  'appearance',
  'haptics',
  'notifications',
]);
const isInfoKey = (k: PageKey): k is InfoKey => INFO_KEYS.has(k);
const isSettingKey = (k: PageKey): k is SettingKey => SETTING_KEYS.has(k);

/** Pages that need a fixed tall snap (keyboard or long scrolling list). */
const TALL_PAGES: ReadonlySet<PageKey> = new Set(['search', 'saved']);

const INFO_PAGES: Record<InfoKey, { title: string; sections: InfoSection[] }> = {
  about: {
    title: 'about',
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
    title: 'sources',
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
    title: 'privacy',
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
    title: 'contact',
    sections: [
      {
        body: 'Questions, corrections, or feedback.',
        link: { label: 'contact@zuhd.news', url: 'mailto:contact@zuhd.news' },
      },
    ],
  },
};

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'small' },
  { value: 'default', label: 'default' },
  { value: 'large', label: 'large' },
];

const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'source', label: 'source sans' },
  { value: 'system', label: 'system' },
];

const ON_OFF_OPTIONS: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'on' },
  { value: 'off', label: 'off' },
];

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: 'dark', label: 'dark' },
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
];

/** One row per setting — label + current value, navigates to the detail page. */
const SETTINGS: {
  key: SettingKey;
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: string;
}[] = [
  { key: 'size', label: 'size', options: FONT_SIZE_OPTIONS },
  { key: 'font', label: 'font', options: FONT_FAMILY_OPTIONS },
  { key: 'appearance', label: 'appearance', options: APPEARANCE_OPTIONS },
  { key: 'haptics', label: 'haptics', options: ON_OFF_OPTIONS },
  {
    key: 'notifications',
    label: 'notifications',
    options: ON_OFF_OPTIONS,
    hint: 'Briefing ready and breaking news alerts',
  },
];

const PAGE_TITLES: Record<PageKey, string> = {
  about: 'about',
  sources: 'sources',
  privacy: 'privacy',
  contact: 'contact',
  settings: 'settings',
  size: 'size',
  font: 'font',
  appearance: 'appearance',
  haptics: 'haptics',
  notifications: 'notifications',
  search: 'search',
  saved: 'saved',
};

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
      {value && (
        <Text style={{ ...font.regular, fontSize: typography.sizeSm, color: colors.textSecondary }}>
          {value}
        </Text>
      )}
    </HapticPressable>
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
}

export const MenuSheet = memo(function MenuSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onDismiss,
  grouped,
  onSelectArticle,
}: MenuSheetProps) {
  const { colors, font, typography, sheetStyles } = useTheme();
  const { preferences, setFontSize, setFontFamily, setAppearance, setHaptics, setNotifications } =
    usePreferences();
  const nav = useSheetNavigation<PageKey>();
  const isTall = nav.current !== null && TALL_PAGES.has(nav.current);
  const snapProps = useSheetSnaps(isTall);

  const Handle = useCallback(
    () => (
      <SheetHandle
        title={nav.current ? PAGE_TITLES[nav.current] : undefined}
        onBack={nav.depth > 0 ? nav.pop : undefined}
      />
    ),
    [nav.current, nav.depth, nav.pop],
  );

  const handleDismiss = useCallback(() => {
    nav.reset();
    onDismiss();
  }, [onDismiss, nav.reset]);

  // Display value for a given setting (looked up from its options registry)
  const settingValue = useCallback(
    (key: SettingKey): string => {
      const prefValue =
        key === 'size'
          ? preferences.fontSize
          : key === 'font'
            ? preferences.fontFamily
            : key === 'appearance'
              ? preferences.appearance
              : key === 'haptics'
                ? preferences.haptics
                  ? 'on'
                  : 'off'
                : preferences.notifications
                  ? 'on'
                  : 'off';
      const config = SETTINGS.find((s) => s.key === key);
      return config?.options.find((o) => o.value === prefValue)?.label ?? prefValue;
    },
    [preferences],
  );

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
          <NavRow label="search" onPress={() => nav.push('search')} />
          <NavRow label="saved" hint="Your bookmarked articles" onPress={() => nav.push('saved')} />
          <NavRow label="settings" onPress={() => nav.push('settings')} />

          <View style={[styles.divider, { backgroundColor: colors.rule }]} />

          <View style={styles.infoLinks}>
            <ActionLink label="about" onPress={() => nav.push('about')} />
            <ActionLink label="sources" onPress={() => nav.push('sources')} />
            <ActionLink label="privacy" onPress={() => nav.push('privacy')} />
            <ActionLink label="contact" onPress={() => nav.push('contact')} />
            <ActionLink
              label="rate"
              hint="Rate zuhd.news in the App Store"
              onPress={() => StoreReview.requestReview()}
            />
          </View>

          <Text
            style={{
              ...font.regular,
              fontSize: typography.sizeXs,
              color: colors.textSecondary,
              marginTop: SPACING.lg,
            }}
          >
            zuhd.news · {Constants.expoConfig?.version ?? ''}
          </Text>
        </>
      );
    }

    if (current === 'settings') {
      return (
        <>
          {SETTINGS.map((s) => (
            <NavRow
              key={s.key}
              label={s.label}
              value={settingValue(s.key)}
              onPress={() => nav.push(s.key)}
            />
          ))}
        </>
      );
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (isInfoKey(current)) {
      return <SheetInfoPage sections={INFO_PAGES[current].sections} />;
    }

    if (isSettingKey(current)) {
      const config = SETTINGS.find((s) => s.key === current);
      return renderSettingPage(current, config?.hint);
    }
    return null;
  }

  function renderSettingPage(key: SettingKey, hint?: string) {
    switch (key) {
      case 'size':
        return (
          <SheetOptionPage
            options={FONT_SIZE_OPTIONS}
            selected={preferences.fontSize}
            onSelect={setFontSize}
          />
        );
      case 'font':
        return (
          <SheetOptionPage
            options={FONT_FAMILY_OPTIONS}
            selected={preferences.fontFamily}
            onSelect={setFontFamily}
          />
        );
      case 'appearance':
        return (
          <SheetOptionPage
            options={APPEARANCE_OPTIONS}
            selected={preferences.appearance}
            onSelect={setAppearance}
          />
        );
      case 'haptics':
        return (
          <SheetOptionPage
            options={ON_OFF_OPTIONS}
            selected={preferences.haptics ? 'on' : 'off'}
            onSelect={(v) => setHaptics(v === 'on')}
          />
        );
      case 'notifications':
        return (
          <SheetOptionPage
            hint={hint}
            options={ON_OFF_OPTIONS}
            selected={preferences.notifications ? 'on' : 'off'}
            onSelect={(v) => setNotifications(v === 'on')}
          />
        );
    }
  }
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.smPlus,
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
