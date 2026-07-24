import type { Article, Category } from '@shared/types';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Text as RNText,
  StyleSheet,
  type TextStyle,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import {
  type AppearanceMode,
  baseFontSize,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSize,
  type Preferences,
  RADIUS,
  SPACING,
} from '../constants/theme';
import { useSheetBackNavigation } from '../hooks/useSheetBackNavigation';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { type PreferencesApi, usePreferences, useTheme } from '../hooks/useTheme';
import {
  formatBytes,
  getSnapshot as getDataUsage,
  subscribe as subscribeDataUsage,
} from '../lib/data-usage';
import { hapticTick } from '../lib/haptics';
import { resetOnboarding } from '../lib/onboarding-store';
import { staggerEnter } from '../lib/stagger';
import { eraseLocalData } from '../lib/wipe';
import { Icon, Pressable, Text } from './primitives';
import { SheetAboutPage } from './SheetAboutPage';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetScrollView } from './SheetContent';
import { SheetHandle } from './SheetHandle';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SheetSearchPage } from './SheetSearchPage';
import { Toggle } from './Toggle';

const APP_VERSION = Constants.expoConfig?.version ?? '';

// ---------------------------------------------------------------------------
// Registries — one entry per navigable page. Each registry self-describes so
// `renderPage` can be a simple lookup rather than a switch-per-setting.
// ---------------------------------------------------------------------------

const INFO_PAGES = {
  // Every sentence here has to survive someone reading the source. The page
  // previously claimed "No device identifiers, IP addresses, or usage data are
  // logged server-side" while a Pages middleware logged country + path on every
  // app open; the middleware is gone, and the wording below is now scoped to
  // what we actually control rather than to what a CDN does with a TCP
  // connection. Anything added here must be checkable from the repo.
  privacy: {
    sections: [
      {
        body: 'No accounts. No analytics. No telemetry. No advertising. No crash reporting. No third-party SDKs.',
      },
      {
        heading: 'one server',
        body: 'The app contacts one address: zuhd-news.pages.dev. Nothing else is reached automatically — no analytics host, no ad network, no font, map, or image CDN. Source links open in your browser only when you tap them.',
      },
      {
        heading: 'what we know about you',
        body: 'Nothing. The app sends no identifier of any kind, so there is nothing for a request to be attributed to. We run no analytics and keep no record of what anyone reads. The app asks for the same files every reader gets.',
      },
      {
        heading: 'data used',
        body: "A day's news is about 15 KB — text and numbers, compressed. There are no images to load. Settings shows exactly what has been fetched since you opened the app. Audio briefings are the one large download, roughly 3 MB each, and they are fetched only when you press listen.",
      },
      {
        heading: 'on this device',
        body: 'Bookmarks, where the "caught up" line falls, your place in a briefing, how many articles you have read (so the rating prompt asks once, not often), your display preferences, and a cached copy of the latest articles for reading offline. None of it leaves the device. You can erase all of it below.',
      },
      {
        // Written to make opting in feel as safe as it actually is, because it
        // is safe: tokens.js stores `token:<token>` -> '1' with a 90-day TTL,
        // and push.js sends the same payload to every key under that prefix.
        // There is no segmentation to describe because there is none.
        heading: 'notifications',
        body: 'If you turn them on, one thing is stored on our server: the anonymous token your phone issues for push delivery. It sits on its own — no account, no email, nothing attached. Everyone who turns notifications on gets the same alert, so there is no way for us to tell readers apart or to single anyone out. The token expires by itself after 90 days, and switching notifications off deletes it.',
      },
      {
        heading: 'audio',
        body: 'Briefing audio is generated with Google Cloud text-to-speech and hosted on our own infrastructure. Google receives the text to read aloud. It receives nothing about you.',
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
    hint: 'Briefings and breaking news',
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
  const handlePress = useCallback(() => {
    hapticTick();
    onChange(!value);
  }, [onChange, value]);
  return (
    // The whole row is the tap target — a toggle-sized target alone is a
    // reach on a full-bleed settings row, and screen readers get one
    // focusable element carrying the complete switch semantics.
    <Pressable
      onPress={handlePress}
      haptic="none"
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
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
      <Toggle value={value} />
    </Pressable>
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
              accessibilityState={{ checked: active }}
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

/** Read-only settings row — a fact, not a control. */
function ReadoutRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
      ]}
      accessible
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={hint}
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
      <Text variant="caption">{value}</Text>
    </View>
  );
}

/**
 * Erase control for the privacy page. Two taps, not a native Alert: the app
 * has no other modal chrome and a system dialog would be the one piece of
 * borrowed UI in it. The armed state disarms itself after a few seconds so an
 * abandoned first tap can't be completed by a stray second one later.
 */
function EraseControl({ onDone }: { onDone: (message: string) => void }) {
  const { colors } = useTheme();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const handlePress = useCallback(() => {
    if (busy) return;
    if (!armed) {
      hapticTick();
      setArmed(true);
      return;
    }
    setBusy(true);
    setArmed(false);
    eraseLocalData()
      .then(() => onDone('Erased'))
      .catch(() => onDone('Could not erase'))
      .finally(() => setBusy(false));
  }, [armed, busy, onDone]);

  return (
    <>
      <Text variant="labelSm" style={styles.eraseHeading}>
        erase local data
      </Text>
      <Text selectable variant="body">
        Removes your bookmarks, reading position, cached articles, and the count behind the rating
        prompt. Your display settings and notification choice are left alone — those are
        preferences, not a record of what you read.
      </Text>
      <Pressable
        onPress={handlePress}
        haptic="none"
        style={[styles.erasePill, { borderColor: colors.rule }]}
        accessibilityRole="button"
        accessibilityLabel={armed ? 'Confirm erase local data' : 'Erase local data'}
        accessibilityHint={armed ? undefined : 'Asks for confirmation before erasing'}
      >
        <Text variant="captionEmphasis" tone={armed ? 'unfavorable' : 'default'}>
          {busy ? 'erasing…' : armed ? 'tap again to erase' : 'erase'}
        </Text>
      </Pressable>
    </>
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
      {/* Matches NavRow's `label`. These two row types are structurally the
          same control — same padding, same chevron, both push a page — and
          rendering them at different sizes made the secondary group (about,
          privacy, contact) read as fine print. The divider above already
          carries the hierarchy. Also lifts the row from a ~38pt tap target to
          ~46pt, clearing the 44pt minimum. */}
      <Text variant="label" tone="default">
        {label}
      </Text>
      <Icon name="chevron-forward" size="sm" tone="secondary" />
    </Pressable>
  );
}

interface MenuSheetProps extends BaseSheetProps {
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
  const { colors, font } = useTheme();
  const prefsApi = usePreferences();
  const { preferences } = prefsApi;
  const nav = useSheetNavigation<PageKey>();
  const [canRate, setCanRate] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const dataUsed = useSyncExternalStore(subscribeDataUsage, getDataUsage);

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

  const swipeBack = useSheetBackNavigation({
    isOpen,
    canGoBack: nav.depth > 0,
    onBack: navPop,
    sheetRef,
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
          <SheetScrollView bottomInset={bottomInset}>{renderPage()}</SheetScrollView>
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
                // Not "in the App Store" — this row also ships on Google Play.
                hint="Opens the rating prompt"
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
            const entering = reduceMotion ? undefined : staggerEnter(i);
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
          {/* A number the reader can watch, rather than a claim they have to
              accept. This is the app's central promise made checkable — see
              lib/data-usage.ts for what it counts and why it counts high. */}
          <Animated.View entering={reduceMotion ? undefined : staggerEnter(SETTINGS.length)}>
            <ReadoutRow
              label="data used"
              value={formatBytes(dataUsed)}
              hint="Articles fetched since you opened the app"
            />
          </Animated.View>
          <Animated.View entering={reduceMotion ? undefined : staggerEnter(SETTINGS.length + 1)}>
            <NavRow
              label="show tips again"
              hint="Shows the reading hints again"
              onPress={() => {
                resetOnboarding();
                // "hints", not "tips" — every other surface (HintId, HINT_COPY,
                // the row above) calls them hints. One name per thing.
                onToast?.('Hints will reappear as you read');
                sheetRef.current?.dismiss();
              }}
            />
          </Animated.View>
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
      return (
        <SheetInfoPage
          sections={INFO_PAGES[current].sections}
          footer={current === 'privacy' ? <EraseControl onDone={(m) => onToast?.(m)} /> : undefined}
        />
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
  eraseHeading: {
    marginBottom: SPACING.xs,
  },
  erasePill: {
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.floating,
    // Outlined, not filled: a destructive control should read as deliberate
    // rather than inviting. Matches the BottomActionBar pill's hairline edge.
    borderWidth: StyleSheet.hairlineWidth,
  },
});
