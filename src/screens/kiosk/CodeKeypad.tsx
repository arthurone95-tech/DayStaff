import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STAFF_CODE_MAX_LENGTH } from '../../config/app';
import { colors, fontSize, radius, spacing } from '../../theme';

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const MAX_CODE_LENGTH = STAFF_CODE_MAX_LENGTH;

interface CodeKeypadProps {
  code: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

export function CodeKeypad({
  code,
  hint,
  error,
  disabled = false,
  onChange,
  onSubmit,
}: CodeKeypadProps) {
  const tap = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  const append = (key: string) => {
    if (disabled || code.length >= MAX_CODE_LENGTH) {
      return;
    }
    tap();
    onChange(code + key);
  };

  const backspace = () => {
    if (disabled || code.length === 0) {
      return;
    }
    tap();
    onChange(code.slice(0, -1));
  };

  const clear = () => {
    if (disabled || code.length === 0) {
      return;
    }
    tap();
    onChange('');
  };

  const verify = () => {
    if (disabled || code.length < 2) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSubmit();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.display}>
        <View style={styles.displayHeader}>
          <Text style={styles.displayLabel}>Staff code</Text>
          <Text style={styles.displayCount}>
            {code.length}/{MAX_CODE_LENGTH}
          </Text>
        </View>
        <Text
          style={[styles.code, !code && styles.codePlaceholder]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {code || 'Enter your code'}
        </Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : (
          <Text style={styles.hint}>
            Your code is printed on your staff card.
          </Text>
        )}
      </View>

      <View style={styles.grid}>
        {KEYS.map((key) => (
          <View key={key} style={styles.cell}>
            <Pressable
              onPress={() => append(key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Enter ${key}`}
              style={({ pressed }) => [
                styles.key,
                pressed && styles.keyPressed,
                disabled && styles.keyDisabled,
              ]}
            >
              <Text style={styles.keyLabel}>{key}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={backspace}
          disabled={disabled || code.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Delete last character"
          style={({ pressed }) => [
            styles.action,
            pressed && styles.keyPressed,
            (disabled || code.length === 0) && styles.actionDisabled,
          ]}
        >
          <Ionicons
            name="backspace-outline"
            size={20}
            color={colors.kioskText}
          />
          <Text style={styles.actionLabel}>Delete</Text>
        </Pressable>

        <Pressable
          onPress={clear}
          disabled={disabled || code.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear code"
          style={({ pressed }) => [
            styles.action,
            pressed && styles.keyPressed,
            (disabled || code.length === 0) && styles.actionDisabled,
          ]}
        >
          <Text style={styles.actionLabel}>Clear</Text>
        </Pressable>

        <Pressable
          onPress={verify}
          disabled={disabled || code.length < 2}
          accessibilityRole="button"
          accessibilityLabel="Verify code with biometrics"
          style={({ pressed }) => [
            styles.verify,
            pressed && styles.keyPressed,
            (disabled || code.length < 2) && styles.actionDisabled,
          ]}
        >
          <Ionicons name="finger-print" size={22} color={colors.white} />
          <Text style={styles.verifyLabel}>Verify</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  display: {
    backgroundColor: colors.kioskSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  displayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  displayCount: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  code: {
    marginTop: spacing.xs,
    color: colors.kioskText,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  codePlaceholder: {
    color: colors.kioskMuted,
    fontSize: fontSize.lg,
    fontWeight: '500',
    letterSpacing: 0,
  },
  hint: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
  },
  error: {
    marginTop: spacing.xs,
    color: '#FCA5A5',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  cell: {
    width: '16.6667%',
    padding: 3,
  },
  key: {
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.kioskSurface,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    color: colors.kioskText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.kioskSurface,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  actionLabel: {
    color: colors.kioskText,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  verify: {
    flex: 1.3,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  verifyLabel: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
});
