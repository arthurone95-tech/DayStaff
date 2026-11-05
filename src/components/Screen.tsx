import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  SafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

interface ScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  padded?: boolean;
  backgroundColor?: string;
}

export function Screen({
  children,
  style,
  edges = ['left', 'right', 'bottom'],
  padded = false,
  backgroundColor = colors.background,
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor }, style]}
    >
      <View style={[styles.inner, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
