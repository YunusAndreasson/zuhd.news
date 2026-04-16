import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DARK_COLORS, SPACING } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong.</Text>
        <Text style={styles.detail} numberOfLines={3}>
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retry}>Try again</Text>
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
  },
  title: {
    color: DARK_COLORS.text,
    fontSize: 18,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  detail: {
    color: DARK_COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retry: {
    color: DARK_COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
