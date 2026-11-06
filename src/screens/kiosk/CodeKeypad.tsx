import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STAFF_CODE_MAX_LENGTH } from '../../config/app';
import { colors, fontSize, radius, spacing } from '../../theme';

/**
 * Balanced rows keep every key the same height while filling the full width.
 * Letters use 9 columns (9 / 9 / 8) and numbers use 5 columns (5 / 5), which
 * removes the unused space on the right and keeps the keypad shorter than the
 * previous 6 × 6 grid.
 */
const LETTER_ROWS = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'].map((row) =>
  row.split(''),
);
const DIGIT_ROWS = ['01234', '56789'].map((row) => row.split(''));
const MAX_CODE_LENGTH = STAFF_CODE_MAX_LENGTH;

interface CodeKeypadProps {
  code: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

interface KeyButtonProps {
  value: string;
  digit?: boolean;
  disabled: boolean;
  onPress: () => void;
}

function KeyButton({ value, digit = false, disabled, onPress }: KeyButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Enter ${value}`}
      style={({ pressed }) => [
        styles.key,
        digit && styles.keyDigit,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      <Text style={[styles.keyLabel, digit && styles.keyLabelDigit]}>
        {value}
      </Text>
    </Pressable>
  );
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
          {code || '_ _ _ _ _ _'}
        </Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Letters A–Z</Text>
        <View style={styles.sectionLine} />
      </View>

      {LETTER_ROWS.map((row) => (
        <View key={row.join('')} style={styles.gridRow}>
          {row.map((key) => (
            <View
              key={key}
              style={[styles.cell, { width: `${100 / row.length}%` }]}
            >
              <KeyButton
                value={key}
                disabled={disabled}
                onPress={() => append(key)}
              />
            </View>
          ))}
        </View>
      ))}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Numbers 0–9</Text>
        <View style={styles.sectionLine} />
      </View>

      {DIGIT_ROWS.map((row) => (
        <View key={row.join('')} style={styles.gridRow}>
          {row.map((key) => (
            <View
              key={key}
              style={[styles.cell, { width: `${100 / row.length}%` }]}
            >
              <KeyButton
                value={key}
                digit
                disabled={disabled}
                onPress={() => append(key)}
              />
            </View>
          ))}
        </View>
      ))}

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
    alignSelf: 'stretch',
  },
  display: {
    backgroundColor: colors.kioskSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 7,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 2,
    paddingHorizontal: 3,
  },
  sectionLabel: {
    color: colors.kioskMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.kioskSurfaceRaised,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    padding: 3,
  },
  key: {
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.kioskSurface,
    borderWidth: 1,
    borderColor: colors.kioskSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDigit: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: 'rgba(59, 130, 246, 0.55)',
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
  keyLabelDigit: {
    color: '#DBEAFE',
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
    height: 50,
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
    height: 50,
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
