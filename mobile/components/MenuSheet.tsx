import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
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
      { body: 'Each article says what happened, why it matters, and what comes next. Then it stops.' },
      { body: 'Forty sources across six continents. Where a story is told from determines who is a person and who is a number.' },
      { body: 'No social media. That time goes toward the work.' },
      { link: { label: 'zuhd.news', url: 'https://zuhd.news' }, body: '' },
    ],
  },
  sources: {
    title: 'sources',
    sections: [
      { body: 'Selected for editorial independence, not funding model. State-funded outlets are included if editorially autonomous; editorial interference disqualifies regardless of ownership.' },
      { heading: 'middle east', body: 'Al Jazeera, Al Monitor, Haaretz, Medyascope, Middle East Eye' },
      { heading: 'asia', body: 'Antara News, Daily Star, Dawn, Malay Mail, South China Morning Post, The Hindu, Yonhap' },
      { heading: 'africa', body: 'AllAfrica, Daily Maverick, Mada Masr, Premium Times, TSA' },
      { heading: 'americas', body: 'Buenos Aires Times, CBC News, Fox News, MercoPress' },
      { heading: 'oceania', body: 'ABC News Australia, RNZ Pacific' },
      { heading: 'europe', body: 'BBC, Deutsche Welle, France 24, Moscow Times, Sveriges Radio' },
      { heading: 'specialist', body: '404 Media, Ars Technica, Bellingcat, Carbon Brief, CoinDesk, Hacker News, MIT Technology Review, Nature, New Scientist, Quanta Magazine, Rest of World, STAT News' },
    ],
  },
  privacy: {
    title: 'privacy',
    sections: [
      { body: 'No cookies. No analytics. No tracking. No third-party scripts. No accounts.' },
      { heading: 'website', body: 'Your browser remembers which articles you have read. That data stays on your device. Typefaces load from our own servers.' },
      { heading: 'mobile app', body: 'The app fetches content over HTTPS without sending identifying information or usage metrics. Reading preferences and history remain on your device. The app does not use third-party analytics, advertising frameworks, or crash reporting services.' },
      { heading: 'audio briefings', body: 'Audio is generated with Google Cloud Text-to-Speech and hosted by us. Downloads go directly to your device without sharing information with Google.' },
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
