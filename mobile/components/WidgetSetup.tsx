import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { analytics } from '../lib/analytics';
import {
  canPinWidget,
  currentWidgetEdition,
  observeWidget,
  pinWidget,
  setWidgetWallpaper,
  widgetPreview,
  widgetWallpaper,
} from '../lib/widget-store';
import { MenuRow } from './MenuRow';
import { Icon, Pressable, Text } from './primitives';
import { Spark } from './Spark';

export function WidgetSetup({ done }: { done: () => void }) {
  const { colors } = useTheme();
  const [guide, setGuide] = useState(false);
  const [wallpaper, setWallpaper] = useState(widgetWallpaper);
  const ios = Platform.OS === 'ios',
    pin = !ios && canPinWidget();
  const face = widgetPreview(),
    e = currentWidgetEdition();
  const points = e?.close?.observations;
  useEffect(() => {
    void analytics.track(ANALYTICS_EVENTS.WIDGET_OFFER_VIEWED, { source: 'menu' });
    return () => {
      void observeWidget();
    };
  }, []);
  const setup = () => {
    void analytics.track(ANALYTICS_EVENTS.WIDGET_SETUP_STARTED, {
      source: 'menu',
      method: pin ? 'android_pin' : ios ? 'ios_guide' : 'android_guide',
    });
    if (pin && pinWidget()) return;
    setGuide(true);
  };
  return (
    <View style={styles.page}>
      <Text variant="sectionHeading">
        {guide ? 'Add to your Home Screen' : 'Daily briefing widget'}
      </Text>
      {guide ? (
        (ios
          ? [
              'Touch and hold an empty area of your Home Screen.',
              'Tap Edit, then Add Widget. On older versions, tap +.',
              'Search for zuhd.news, choose Daily briefing, then tap Add Widget.',
            ]
          : [
              'Touch and hold an empty area of your Home screen.',
              'Open Widgets and find zuhd.news.',
              'Touch and hold Daily briefing, then place it on your Home screen.',
            ]
        ).map((line, i) => (
          <View key={line} style={styles.row}>
            <Text variant="rowTitle">{i + 1}</Text>
            <Text variant="body" style={styles.flex}>
              {line}
            </Text>
          </View>
        ))
      ) : (
        <Text variant="body">
          {face.subject
            ? 'See how a market moved over seven days. Tap to listen when the briefing is available, or open the dated chart.'
            : face.date
              ? 'See the edition and its listening time. Tap to open the briefing.'
              : 'Open the app when connected to load an edition.'}
        </Text>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          [face.closeLabel, face.publicLabel].filter(Boolean).join(' ') || 'Daily briefing'
        }
        disabled={!face.url}
        onPress={() => {
          if (face.url) void Linking.openURL(face.url + '?preview=1');
        }}
        style={[styles.preview, { backgroundColor: colors.sheetBg, borderColor: colors.rule }]}
      >
        <View style={styles.row}>
          <Text variant="rowTitle" style={styles.flex}>
            {face.subject ?? 'Daily briefing'}
          </Text>
          <Text variant="caption">{face.date ?? ''}</Text>
        </View>
        {face.value ? (
          <View style={styles.row}>
            <Text variant="display" style={styles.flex}>
              {face.value}
            </Text>
            {points?.length ? (
              <Spark
                path={{
                  days: points.map((p) => Date.parse(p.date) / 86400000),
                  values: points.map((p) => (p.value / points[0]!.value - 1) * 100),
                }}
              />
            ) : null}
          </View>
        ) : null}
        {face.move ? <Text variant="caption">{face.move}</Text> : null}
        <View style={[styles.footer, { borderColor: colors.rule }]}>
          <Icon
            name={face.action === 'Listened' ? 'check' : face.playable ? 'play' : 'headphones'}
            size="sm"
          />
          <Text variant="rowTitle" style={styles.flex}>
            {face.action ?? 'Open zuhd.news'}
          </Text>
          <Text variant="caption">{face.minutes ?? ''}</Text>
        </View>
      </Pressable>
      {!guide && !ios && Number(Platform.Version) >= 31 ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: wallpaper }}
          onPress={() => {
            setWallpaper(!wallpaper);
            void setWidgetWallpaper(!wallpaper);
          }}
          style={styles.row}
        >
          <Text variant="body" style={styles.flex}>
            Use wallpaper colours
          </Text>
          <Text variant="caption">{wallpaper ? 'On' : 'Off'}</Text>
        </Pressable>
      ) : null}
      <MenuRow
        title={guide ? 'Done' : pin ? 'Add to Home screen' : 'Show how to add'}
        onPress={guide ? done : setup}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { padding: SPACING.md, gap: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  flex: { flex: 1 },
  preview: {
    padding: SPACING.md,
    gap: SPACING.xs,
    borderRadius: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
