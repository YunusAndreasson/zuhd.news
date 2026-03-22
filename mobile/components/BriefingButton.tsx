import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE, COLORS, FONT, LAYOUT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';

interface BriefingButtonProps {
  date: string;
}

export const BriefingButton = memo(function BriefingButton({ date }: BriefingButtonProps) {
  const insets = useSafeAreaInsets();
  const { impact } = useHaptic();
  const [playing, setPlaying] = useState(false);
  const [playerRef, setPlayerRef] = useState<{
    play(): void;
    pause(): void;
    remove(): void;
  } | null>(null);

  useEffect(() => {
    return () => {
      playerRef?.remove();
    };
  }, [playerRef]);

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
          uri: `${API_BASE}/audio/briefing-${date}.mp3`,
        });
        setPlayerRef(player);
        player.play();
        setPlaying(true);
      }
    } catch {
      // expo-audio unavailable in this Expo Go build — button stays visible, tap is a no-op
    }
  }, [impact, playerRef, playing, date]);

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
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={TYPOGRAPHY.sizeSm - 4}
          color={COLORS.accent}
          style={{ marginTop: 2 }}
        />
        <Text style={styles.label}>briefing</Text>
      </View>
    </Pressable>
  );
});

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
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
});
