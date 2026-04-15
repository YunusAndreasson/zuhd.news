import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { memo, useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact, hapticTick } from '../lib/haptics';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

// ---------------------------------------------------------------------------
// Info page content
// ---------------------------------------------------------------------------

interface InfoSection {
  heading?: string;
  body: string;
  link?: { label: string; url: string };
}

const INFO_PAGES: Record<string, { title: string; sections: InfoSection[] }> = {
  about: {
    title: 'about',
    sections: [
      { body: 'Zuhd \u2014 the discipline of doing without what you do not need.' },
      { body: 'What happened. Why it matters. What comes next. Then stop.' },
      { body: 'Hundreds of sources across six continents, selected for editorial independence. Where a story is told from determines who is treated as a person and who as a statistic.' },
      { body: 'No social media, no investors, no editorial board.' },
      { link: { label: 'zuhd.news', url: 'https://zuhd.news' }, body: '' },
    ],
  },
  sources: {
    title: 'sources',
    sections: [
      { body: 'Stories are compiled from hundreds of outlets indexed by EventRegistry. A language model selects and writes each article based on geographic breadth and editorial significance.' },
      { heading: 'inclusion', body: 'Editorial independence determines inclusion. State-funded outlets qualify if editorially autonomous. Editorial interference disqualifies regardless of ownership.' },
      { heading: 'transparency', body: 'Every article lists the outlets used, their country of origin, and how each covers the story. Tap \u201cmore\u201d on any article to inspect.' },
    ],
  },
  privacy: {
    title: 'privacy',
    sections: [
      { body: 'No accounts. No analytics. No telemetry. No advertising. No crash reporting. No third-party SDKs.' },
      { heading: 'data collection', body: 'None. The app makes HTTPS requests to zuhd-news.pages.dev and receives JSON. No device identifiers, IP addresses, or usage data are logged server-side.' },
      { heading: 'local storage', body: 'Reading history, bookmarks, and preferences are stored on-device using AsyncStorage. This data never leaves your device.' },
      { heading: 'network requests', body: 'Content fetches, context briefs, and audio downloads go to Cloudflare Pages. No third-party endpoints are contacted.' },
      { heading: 'audio', body: 'Briefing audio is generated via Google Cloud TTS and hosted on our infrastructure. Google receives the text to synthesize; it does not receive any user data.' },
      { heading: 'notifications', body: 'Push tokens are stored on our server to deliver alerts. No other identifying information is collected alongside the token.' },
    ],
  },
  contact: {
    title: 'contact',
    sections: [
      { body: 'Questions, corrections, or feedback.', link: { label: 'contact@zuhd.news', url: 'mailto:contact@zuhd.news' } },
    ],
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, font, typography } = useTheme();
  return (
    <Pressable
      onPress={() => { hapticImpact(); onPress(); }}
      style={({ pressed }) => [styles.menuItem, pressed && PRESSED_STYLE]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={{
          ...font.smallCaps,
          fontSize: typography.sizeBase,
          letterSpacing: typography.trackingCaps,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InfoLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, font, typography } = useTheme();
  return (
    <Pressable
      onPress={() => { hapticImpact(); onPress(); }}
      style={({ pressed }) => pressed && PRESSED_STYLE}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ ...font.semiBold, fontSize: typography.sizeSm, color: colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// MenuSheet — menu + inline info pages
// ---------------------------------------------------------------------------

interface MenuSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  onSearchPress: () => void;
  onBookmarkPress: () => void;
  onSettingsPress: () => void;
}

export const MenuSheet = memo(function MenuSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onSearchPress,
  onBookmarkPress,
  onSettingsPress,
}: MenuSheetProps) {
  const { colors, font, typography, sheetStyles, textStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const [activePage, setActivePage] = useState<string | null>(null);
  const activePageRef = useRef<string | null>(null);
  activePageRef.current = activePage;

  const Handle = useCallback(() => {
    const page = activePageRef.current;
    return <SheetHandle title={page ? INFO_PAGES[page]?.title : undefined} />;
  }, []);

  const navigateTo = useCallback((page: string) => {
    hapticTick();
    setActivePage(page);
  }, []);

  const navigateBack = useCallback(() => {
    hapticTick();
    setActivePage(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setActivePage(null);
    onDismiss();
  }, [onDismiss]);

  const infoData = activePage ? INFO_PAGES[activePage] : null;

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={Handle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {infoData ? (
          /* ── Info page view ── */
          <>
            <Pressable
              onPress={navigateBack}
              style={({ pressed }) => [styles.backButton, pressed && PRESSED_STYLE]}
              accessibilityRole="button"
              accessibilityLabel="Back to menu"
            >
              <Text
                style={{
                  ...font.smallCaps,
                  fontSize: typography.sizeSm,
                  letterSpacing: typography.trackingCaps,
                  color: colors.text,
                }}
              >
                {'\u2190 menu'}
              </Text>
            </Pressable>

            {infoData.sections.map((section, i) => (
              <View key={i} style={i > 0 ? styles.infoSection : undefined}>
                {section.heading && (
                  <Text style={[styles.infoHeading, textStyles.smallCaps]}>
                    {section.heading}
                  </Text>
                )}
                {section.body.length > 0 && (
                  <Text
                    selectable
                    style={{
                      ...font.regular,
                      fontSize: typography.sizeSm,
                      lineHeight: typography.sizeSm * typography.leadingBody,
                      color: section.heading ? colors.text : colors.accent,
                    }}
                  >
                    {section.body}
                  </Text>
                )}
                {section.link && (
                  <Pressable
                    onPress={() => Linking.openURL(section.link!.url)}
                    style={({ pressed }) => [styles.infoLink, pressed && PRESSED_STYLE]}
                    accessibilityRole="link"
                    accessibilityLabel={section.link.label}
                  >
                    <Text
                      style={{
                        ...font.semiBold,
                        fontSize: typography.sizeSm,
                        color: colors.accent,
                        textDecorationLine: 'underline',
                      }}
                    >
                      {section.link.label}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </>
        ) : (
          /* ── Menu view ── */
          <>
            <MenuItem label="search" onPress={onSearchPress} />
            <MenuItem label="saved" onPress={onBookmarkPress} />
            <MenuItem label="settings" onPress={onSettingsPress} />

            <View style={[styles.divider, { backgroundColor: colors.rule }]} />

            <View style={styles.infoLinks}>
              <InfoLink label="about" onPress={() => navigateTo('about')} />
              <InfoLink label="sources" onPress={() => navigateTo('sources')} />
              <InfoLink label="privacy" onPress={() => navigateTo('privacy')} />
              <InfoLink label="contact" onPress={() => navigateTo('contact')} />
              <InfoLink label="rate" onPress={() => StoreReview.requestReview()} />
            </View>

            <Text
              style={{
                ...font.regular,
                fontSize: typography.sizeXs,
                color: colors.textSecondary,
                opacity: 0.5,
                marginTop: SPACING.lg,
              }}
            >
              zuhd.news · {Constants.expoConfig?.version ?? ''}
            </Text>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  menuItem: {
    paddingVertical: SPACING.smPlus,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.md,
  },
  infoLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  backButton: {
    marginBottom: SPACING.lg,
  },
  infoSection: {
    marginTop: SPACING.md,
  },
  infoHeading: {
    marginBottom: SPACING.xs,
  },
  infoLink: {
    marginTop: SPACING.xs,
  },
});
