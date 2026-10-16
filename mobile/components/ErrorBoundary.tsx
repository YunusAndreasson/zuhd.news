import { reloadAppAsync } from 'expo';
import * as Updates from 'expo-updates';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DARK_COLORS,
  FONT_SYSTEM,
  LAYOUT,
  MAX_FONT_SCALE,
  makeTypography,
  SPACING,
} from '../constants/theme';
import { type Recovery, recoveryFor } from '../lib/error-recovery';
import { flushStores } from '../lib/flush-stores';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** When the tree last threw. */
  failedAt: number;
  /** When the reader last pressed `try again`. */
  resetAt: number | null;
  /** Where in the tree it threw, for the diagnostic line. */
  componentStack: string | null;
}

// ErrorBoundary lives above ThemeProvider in the tree, so it can't consume the
// theme context. Fall back to dark-mode defaults and the shared typography
// scale at its 375pt widths: the live window's scale is the theme's.
const typography = makeTypography(1);

const COPY: Record<Recovery, { title: string; detail: string | null; action: string }> = {
  retry: { title: 'Something went wrong.', detail: null, action: 'try again' },
  reload: {
    title: 'It went wrong again.',
    detail: 'Reloading starts the app afresh.',
    action: 'reload',
  },
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, failedAt: 0, resetAt: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, failedAt: Date.now() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    if (__DEV__) {
      console.error('[ErrorBoundary]', error);
    }
  }

  reset = () => this.setState({ error: null, resetAt: Date.now() });

  /** Start the JavaScript again, on the newest update that has downloaded;
   *  where updates are off (a development build), on the same bundle. The
   *  stores' pending writes go first: a reload sends no background event. */
  reload = () => {
    try {
      flushStores();
    } catch {}
    Updates.reloadAsync()
      .catch(() => reloadAppAsync('The error screen asked for a reload'))
      .catch(this.reset);
  };

  render() {
    const { error, failedAt, resetAt, componentStack } = this.state;
    if (!error) return this.props.children;
    const recovery = recoveryFor(resetAt, failedAt);
    const copy = COPY[recovery];
    // The raw message is a developer's ("undefined is not a function"); a
    // reader gets what to do about it.
    const detail = __DEV__ ? error.message : copy.detail;
    // For now the error itself is printed too, selectable, so a tester can
    // copy it: the 2.9.0 build fails at launch and nothing else reports it.
    const frames = (componentStack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);
    const diagnostic = [`${error.name}: ${error.message}`, ...frames].join('\n');
    return (
      <View style={styles.root}>
        <View style={styles.words}>
          <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
            {copy.title}
          </Text>
          {detail ? (
            <Text
              style={styles.detail}
              numberOfLines={3}
              maxFontSizeMultiplier={MAX_FONT_SCALE.body}
            >
              {detail}
            </Text>
          ) : null}
          <Text selectable style={styles.diagnostic} maxFontSizeMultiplier={MAX_FONT_SCALE.body}>
            {diagnostic}
          </Text>
        </View>
        <Pressable
          onPress={recovery === 'reload' ? this.reload : this.reset}
          hitSlop={LAYOUT.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={recovery === 'reload' ? 'Reload the app' : 'Try again'}
        >
          <Text style={styles.retry} maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
            {copy.action}
          </Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  words: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    color: DARK_COLORS.text,
    fontSize: typography.sizeLg,
    textAlign: 'center',
  },
  detail: {
    color: DARK_COLORS.textSecondary,
    fontSize: typography.sizeSm,
    textAlign: 'center',
  },
  diagnostic: {
    color: DARK_COLORS.textSecondary,
    fontSize: typography.sizeXs,
    marginTop: SPACING.md,
  },
  retry: {
    color: DARK_COLORS.text,
    fontSize: typography.sizeSm,
    ...FONT_SYSTEM.semiBold,
  },
});
