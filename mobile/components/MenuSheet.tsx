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
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import {
  type AppearanceMode,
  baseFontSize,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSize,
  HIT_SLOP,
  LAYOUT,
  SPACING,
} from '../constants/theme';
import { useSheetBackNavigation } from '../hooks/useSheetBackNavigation';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { usePreferences, useTheme } from '../hooks/useTheme';
import {
  getSnapshot as getBookmarks,
  subscribe as subscribeBookmarks,
} from '../lib/bookmark-store';
import {
  formatBytes,
  getSnapshot as getDataUsage,
  subscribe as subscribeDataUsage,
} from '../lib/data-usage';
import { hapticError, hapticNotification, hapticTick } from '../lib/haptics';
import { resetOnboarding } from '../lib/onboarding-store';
import { makeStaggerEnter } from '../lib/stagger';
import { eraseLocalData } from '../lib/wipe';
import { MenuControlRow, MenuRow, SectionLabel } from './MenuRow';
import { Pressable, Text } from './primitives';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';
import { SheetAboutPage } from './SheetAboutPage';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetScrollView } from './SheetContent';
import { SheetHandle } from './SheetHandle';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SheetMapKeyPage } from './SheetMapKeyPage';
import { SheetSearchPage } from './SheetSearchPage';
import { Toggle } from './Toggle';

const APP_VERSION = Constants.expoConfig?.version ?? '';
const CONTACT_EMAIL = 'contact@zuhd.news';

// ---------------------------------------------------------------------------
// The prose pages' copy. Settings were a registry here too until 2026-09-25;
// they are written out in `renderPage` now, because a flat list of entries
// could not hold the sections they are grouped into.
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
        // Until 2026-09-25 this also said "No telemetry … No third-party
        // SDKs", and the next section "The app contacts one address". The
        // update check (expo-updates → u.expo.dev, with a per-install
        // `EAS-Client-ID`, every launch) and the push service (exp.host, only
        // with notifications on) made all three untrue. Named in plain words,
        // not by vendor: a reader has no idea what Expo is.
        body: 'No accounts. No analytics. No advertising.',
      },
      {
        heading: 'what the app contacts',
        body: 'Stories, map data and audio come from one address: zuhd-news.pages.dev. The app also checks for updates when it opens, which sends its version and a random number for this install — nothing about what you read. With notifications on, the service that delivers them is contacted too. No analytics, no ad network, no font, map or image service. Source links open in your browser only when you tap them.',
      },
      {
        // Shares its core sentence verbatim with SheetAboutPage's
        // NO_PROFILE_LINE and the store listing. Change it in all three.
        heading: 'what we know about you',
        body: 'Nothing. There are no accounts. The app sends no identifier when it fetches the news, so the news server cannot tell readers apart, and it keeps no record of what anyone reads.',
      },
      {
        heading: 'data used',
        // Measured 2026-09-25 on the built API: feed-lite 22 KB gzipped, the
        // feed plus the eleven snapshots ~112 KB brotli cold, and 304s after
        // (ETags). Briefings are 64 kbps and ran 7.5–10 minutes: 3.6–4.8 MB.
        // It said 15 KB and 3 MB, and Settings counts decoded bytes.
        body: 'The day’s stories are about 20 KB, compressed, and the map’s layers about 100 KB the first time; after that only what has changed is downloaded. There are no images to load. Audio briefings are the exception: about 4 MB each, downloaded only when you press listen. Settings shows what the app has fetched since you opened it, counted before compression, so it reads higher.',
      },
      {
        // Fragments, not a sentence. Six things joined by commas read as a
        // legal inventory; the same six as separate statements read as an
        // answer — and match the cadence of "No ads. No tracking." above.
        heading: 'on this device',
        // Checked against the stores 2026-09-25: the chart-history store went
        // on 09-13, `found` is any story opened, and `read-store` keeps which
        // stories, not a count. Erase keeps display settings and the
        // notification choice, so "all of it" was not true either.
        body: 'Saved stories. Which stories were already here last time, so the new ones can be marked. Which stories you have opened and read. When you last left the app. Your place in a briefing. Which tips you have seen. Your display settings. A cached copy of the latest stories and map data, so they open without a connection and an unchanged file is not downloaded twice.\n\nNone of it leaves the device. You can erase it below.',
      },
      {
        // Written to make opting in feel as safe as it actually is, because it
        // is safe: tokens.js stores `token:<token>` -> '1' with a 90-day TTL,
        // and push.js sends the same payload to every key under that prefix.
        // There is no segmentation to describe because there is none.
        // Deliberately does NOT restate "no way to tell readers apart" — the
        // section above owns that claim, and saying it twice within one page
        // is the kind of protesting-too-much that makes a privacy page read
        // like a disclaimer. This section carries only what is specific to
        // notifications.
        heading: 'notifications',
        body: 'If you turn them on, one thing is stored on our server: the token your phone issues for push delivery. Nothing is attached to it — no account, no email, no history. Everyone who turns notifications on receives the same alert. The token expires after 90 days, and turning notifications off deletes it.',
      },
      {
        heading: 'audio',
        body: 'Briefing audio is generated with Google Cloud text-to-speech and hosted on our own infrastructure. Google receives the text to read aloud. It receives nothing about you.',
      },
    ],
  },
} as const satisfies Record<string, { sections: InfoSection[] }>;

type InfoKey = keyof typeof INFO_PAGES;

const FONT_SIZE_OPTIONS: SegmentOption<FontSize>[] = [
  { value: 'small', label: 'small' },
  { value: 'default', label: 'default' },
  { value: 'large', label: 'large' },
];

const FONT_FAMILY_OPTIONS: SegmentOption<FontFamily>[] = [
  { value: 'source', label: 'Source Sans' },
  { value: 'system', label: 'system' },
];

const APPEARANCE_OPTIONS: SegmentOption<AppearanceMode>[] = [
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

/** Each family's name set in itself, so the picker shows what it picks. */
const fontFamilyLabel = (v: FontFamily): TextStyle =>
  v === 'source' ? FONT_SOURCE.regular : FONT_SYSTEM.regular;

type PageKey = InfoKey | 'about' | 'settings' | 'search' | 'saved' | 'map key';

const isInfoKey = (k: PageKey): k is InfoKey => k in INFO_PAGES;

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
      .then(() => {
        hapticNotification();
        onDone('Erased');
      })
      .catch(() => {
        hapticError();
        onDone('Could not erase');
      })
      .finally(() => setBusy(false));
  }, [armed, busy, onDone]);

  return (
    <>
      <Text variant="labelSm" style={styles.eraseHeading}>
        erase local data
      </Text>
      <Text selectable variant="body">
        Removes your saved stories, which stories you have opened and read, your place in a
        briefing, the tips you have seen, and the cached stories and map data. Display settings and
        your notification choice stay.
      </Text>
      <Pressable
        onPress={handlePress}
        haptic="none"
        hitSlop={HIT_SLOP}
        style={[styles.erasePill, { borderColor: colors.accent }]}
        accessibilityRole="button"
        accessibilityLabel={armed ? 'Confirm erase local data' : 'Erase local data'}
        accessibilityHint={armed ? undefined : 'Asks for confirmation before erasing'}
      >
        <Text variant="bodyEmphasis" tone={armed ? 'unfavorable' : 'default'}>
          {busy ? 'erasing…' : armed ? 'tap again to erase' : 'erase'}
        </Text>
      </Pressable>
    </>
  );
}

interface MenuSheetProps extends BaseSheetProps {
  grouped: Record<Category, Article[]>;
  onSelectArticle: (slug: string, category: Category) => void;
  /** Close the menu and open the markets browser, its own sheet. */
  onMarketsPress: () => void;
  onToast?: (message: string) => void;
}

export const MenuSheet = memo(function MenuSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  grouped,
  onSelectArticle,
  onMarketsPress,
  onToast,
}: MenuSheetProps) {
  const { colors, font, typography } = useTheme();
  const prefsApi = usePreferences();
  const { preferences } = prefsApi;
  const nav = useSheetNavigation<PageKey>();
  const [canRate, setCanRate] = useState(false);
  const dataUsed = useSyncExternalStore(subscribeDataUsage, getDataUsage);
  const savedCount = useSyncExternalStore(subscribeBookmarks, getBookmarks).length;

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

  // The root's title is the wordmark, in the handle where every page's title
  // sits. It used to open the page body, 14pt over rows set larger than it,
  // and the root was the one page whose handle was empty.
  const Handle = useCallback(
    () => (
      <SheetHandle
        title={
          nav.current ?? (
            <Text variant="wordmark" accessibilityRole="header" accessibilityLabel="zuhd.news">
              <RNText style={{ ...font.bold, color: colors.textSecondary }}>zuhd</RNText>
              <RNText style={{ ...font.regular, color: colors.accent }}>.news</RNText>
            </Text>
          )
        }
        onBack={nav.depth > 0 ? navPop : undefined}
      />
    ),
    [nav.current, nav.depth, navPop, font, colors.textSecondary, colors.accent],
  );

  const handleDismiss = useCallback(() => {
    nav.reset();
    onDismiss();
  }, [onDismiss, nav.reset]);

  const swipeBack = useSheetBackNavigation({ canGoBack: nav.depth > 0, onBack: navPop });

  // The size picker sets each size in itself — the size the whole app will
  // take, whatever size it is at now.
  const sizeLabelScale = useCallback(
    (v: FontSize) => baseFontSize(v) / typography.sizeBase,
    [typography.sizeBase],
  );

  return (
    <SheetLayout sheetRef={sheetRef} handleComponent={Handle} onDismiss={handleDismiss}>
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
          {/* Markets first, because it was one tap away in the map's top bar
              until 2026-09-21. It leaves the menu for the markets browser
              rather than pushing a page: that sheet flies the globe and hands
              off to a card, and there is only ever one platform sheet up. */}
          <MenuRow
            first
            title="markets"
            description="Exchanges, prices, straits and currencies"
            trailing="push"
            onPress={onMarketsPress}
          />
          <MenuRow
            title="search"
            description="Every story, by title, topic or place"
            trailing="push"
            onPress={() => navPush('search')}
          />
          <MenuRow
            title="saved"
            description="Stories you have kept"
            value={savedCount > 0 ? String(savedCount) : undefined}
            trailing="push"
            onPress={() => navPush('saved')}
          />
          <MenuRow
            title="map key"
            description="What each mark on the globe means"
            trailing="push"
            onPress={() => navPush('map key')}
          />

          <SectionLabel label="the app" />
          <MenuRow
            first
            title="settings"
            description="Text size, appearance, haptics, notifications"
            trailing="push"
            onPress={() => navPush('settings')}
          />
          {/* The rows below settings name themselves, so they carry no
              description: with one each the root outgrew the sheet at the
              large text size, and "rate" was cut off at the foot. */}
          <MenuRow title="about" trailing="push" onPress={() => navPush('about')} />
          <MenuRow title="privacy" trailing="push" onPress={() => navPush('privacy')} />
          {/* Straight to mail. It was a page holding one sentence and this
              address, and the sheet shrank to a quarter of the screen to show
              it. The address is the description, so a reader without a mail
              app still has it. */}
          <MenuRow
            title="contact"
            description={CONTACT_EMAIL}
            trailing="leave"
            onPress={() => {
              Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() =>
                onToast?.(`Write to ${CONTACT_EMAIL}`),
              );
            }}
          />
          {canRate && (
            <MenuRow
              title="rate"
              // Not "in the App Store" — this row also ships on Google Play.
              accessibilityLabel="Rate zuhd.news"
              trailing="leave"
              onPress={() => {
                StoreReview.requestReview().catch(() => {});
              }}
            />
          )}
        </>
      );
    }

    if (current === 'settings') {
      const enter = makeStaggerEnter();
      return (
        <>
          <Animated.View entering={enter()}>
            <SectionLabel first label="display" />
            <MenuControlRow first title="text size">
              <SegmentedControl
                accessibilityLabel="text size"
                options={FONT_SIZE_OPTIONS}
                selected={preferences.fontSize}
                onSelect={prefsApi.setFontSize}
                labelScale={sizeLabelScale}
              />
            </MenuControlRow>
            <MenuControlRow title="font">
              <SegmentedControl
                accessibilityLabel="font"
                options={FONT_FAMILY_OPTIONS}
                selected={preferences.fontFamily}
                onSelect={prefsApi.setFontFamily}
                labelStyle={fontFamilyLabel}
              />
            </MenuControlRow>
            <MenuControlRow title="appearance">
              <SegmentedControl
                accessibilityLabel="appearance"
                options={APPEARANCE_OPTIONS}
                selected={preferences.appearance}
                onSelect={prefsApi.setAppearance}
              />
            </MenuControlRow>
          </Animated.View>

          <Animated.View entering={enter()}>
            <SectionLabel label="touch and alerts" />
            {/* The whole row is the target: a toggle-sized target alone is a
                reach on a full-width row, and a screen reader gets one element
                carrying the whole switch. */}
            <MenuRow
              first
              title="haptics"
              description="A light tap as you swipe, scrub and press"
              trailing={<Toggle value={preferences.haptics} />}
              haptic="none"
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences.haptics }}
              onPress={() => {
                hapticTick();
                prefsApi.setHaptics(!preferences.haptics);
              }}
            />
            <MenuRow
              title="notifications"
              description="Briefings and breaking news"
              trailing={<Toggle value={preferences.notifications} />}
              haptic="none"
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences.notifications }}
              onPress={() => {
                hapticTick();
                if (preferences.notifications) {
                  prefsApi.setNotifications(false);
                  return;
                }
                prefsApi.setNotifications(true).then((granted) => {
                  if (!granted) {
                    onToast?.('Enable notifications in Settings');
                    Linking.openSettings().catch(() => {});
                  }
                });
              }}
            />
          </Animated.View>

          <Animated.View entering={enter()}>
            <SectionLabel label="data" />
            {/* A number the reader can watch, rather than a claim they have to
                accept. This is the app's central promise made checkable — see
                lib/data-usage.ts for what it counts and why it counts high. */}
            <MenuRow
              first
              title="data used"
              description="Fetched since you opened the app"
              value={formatBytes(dataUsed)}
            />
            <MenuRow
              title="show tips again"
              // "tips" — the reader's word, and this row's. The code calls
              // them hints (HintId, HINT_COPY); no screen does.
              description="The swipe and globe tips return as you read"
              onPress={() => {
                resetOnboarding();
                onToast?.('Tips will reappear as you read');
                sheetRef.current?.dismiss();
              }}
            />
          </Animated.View>
        </>
      );
    }

    if (current === 'map key') {
      return <SheetMapKeyPage />;
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (current === 'about') {
      return <SheetAboutPage articles={Object.values(grouped).flat()} version={APP_VERSION} />;
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
  eraseHeading: {
    marginBottom: SPACING.xs,
  },
  erasePill: {
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: LAYOUT.controlHeight,
    paddingHorizontal: SPACING.lg,
    borderRadius: LAYOUT.controlHeight / 2,
    // Outlined, not filled: a destructive control should read as deliberate
    // rather than inviting.
    borderWidth: StyleSheet.hairlineWidth,
  },
});
