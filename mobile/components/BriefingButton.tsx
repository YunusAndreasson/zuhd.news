import { useState, useCallback } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, TYPOGRAPHY, SPACING, LAYOUT } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';

export function BriefingButton() {
  const insets = useSafeAreaInsets();
  const { impact } = useHaptic();
  const [playing, setPlaying] = useState(false);
  const [playerRef, setPlayerRef] = useState<any>(null);

  const handlePress = useCallback(async () => {
    impact();

    try {
      // Lazy-load expo-audio only on press — never at module/hook level
      const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');

      if (playerRef) {
        if (playing) {
          playerRef.pause();
          setPlaying(false);
        } else {
          playerRef.play();
          setPlaying(true);
        }
      } else {
        await setAudioModeAsync({ playsInSilentMode: true });
        const player = createAudioPlayer({
          uri: 'https://zuhd-news.pages.dev/audio/briefing-' +
            new Date().toISOString().slice(0, 10) + '.mp3',
        });
        setPlayerRef(player);
        player.play();
        setPlaying(true);
      }
    } catch {
      // expo-audio unavailable in this Expo Go build — button stays visible, tap is a no-op
    }
  }, [impact, playerRef, playing]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { bottom: insets.bottom + LAYOUT.briefingButtonBottom },
        pressed && { opacity: 0.5 },
      ]}
      onPress={handlePress}
      hitSlop={12}
    >
      <View style={styles.row}>
        <Text style={styles.play}>{playing ? '⏸' : '▸'}</Text>
        <Text style={styles.label}>BRIEFING</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: LAYOUT.briefingButtonRight,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeTab,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  play: {
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.textSecondary,
    lineHeight: TYPOGRAPHY.sizeBase,
  },
});
