import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STAFF_CODE_MAX_LENGTH } from '../../config/app';

/**
 * Local palette for the kiosk keypad. Change a value here and every key,
 * panel and button that uses it updates together.
 */
const UI = {
  panelBg: 'rgba(12, 36, 74, 0.72)',
  panelBorder: 'rgba(59, 130, 246, 0.5)',
  keyBg: '#0F2D57',
  keyBorder: 'rgba(96, 165, 250, 0.4)',
  fieldBorder: '#2F7BFF',
  text: '#FFFFFF',
  muted: '#A9BCE0',
  line: 'rgba(59, 130, 246, 0.45)',
  verifyBg: '#1E6BFF',
  verifyBorder: '#5AA2FF',
  error: '#FCA5A5',
} as const;

/** 7 letters per row; the last row (V-Z) is centered. Digits: 5 per row. */
const LETTER_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'].map((row) =>
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

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
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

  const clearDisabled = disabled || code.length === 0;
  const verifyDisabled = disabled || code.length < 2;

  return (
    <View style={styles.wrap}>
      {/* Staff code card */}
      <View style={styles.display}>
        <View style={styles.displayBody}>
          <Text style={styles.displayLabel}>Staff code</Text>
          <View style={styles.field}>
            <Text
              style={[styles.code, !code && styles.codePlaceholder]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {code || 'Enter your code'}
            </Text>
            <Text style={styles.displayCount}>
              {code.length}/{MAX_CODE_LENGTH}
            </Text>
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : hint ? (
            <Text style={styles.hint}>{hint}</Text>
          ) : null}
        </View>
      </View>

      {/* Letters + numbers panel */}
      <View style={styles.panel}>
        <SectionHeader label="Letters A–Z" />
        {LETTER_ROWS.map((row) => (
          <View key={row.join('')} style={styles.gridRow}>
            {row.map((key) => (
              <View key={key} style={styles.letterCell}>
                <KeyButton
                  value={key}
                  disabled={disabled}
                  onPress={() => append(key)}
                />
              </View>
            ))}
          </View>
        ))}

        <SectionHeader label="Numbers 0–9" />
        {DIGIT_ROWS.map((row) => (
          <View key={row.join('')} style={styles.gridRow}>
            {row.map((key) => (
              <View key={key} style={styles.digitCell}>
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
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={clear}
          disabled={clearDisabled}
          accessibilityRole="button"
          accessibilityLabel="Clear code"
          style={({ pressed }) => [
            styles.action,
            pressed && styles.keyPressed,
            clearDisabled && styles.actionDisabled,
          ]}
        >
          <Ionicons name="trash-outline" size={24} color={UI.text} />
          <Text style={styles.actionLabel}>Clear</Text>
        </Pressable>

        <Pressable
          onPress={verify}
          disabled={verifyDisabled}
          accessibilityRole="button"
          accessibilityLabel="Verify code with biometrics"
          style={({ pressed }) => [
            styles.verify,
            pressed && styles.keyPressed,
            verifyDisabled && styles.actionDisabled,
          ]}
        >
          <Ionicons name="finger-print" size={28} color={UI.text} />
          <Text style={styles.actionLabel}>Verify</Text>
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

  // ---- Staff code card ----
  display: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.panelBg,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: UI.panelBorder,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  displayBody: {
    flex: 1,
  },
  displayLabel: {
    color: UI.muted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginLeft: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: UI.fieldBorder,
    backgroundColor: 'rgba(5, 18, 42, 0.6)',
    paddingHorizontal: 16,
    shadowColor: UI.fieldBorder,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  code: {
    flex: 1,
    color: UI.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  codePlaceholder: {
    color: UI.muted,
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 0,
  },
  displayCount: {
    marginLeft: 8,
    color: UI.muted,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: 4,
    marginLeft: 4,
    color: UI.muted,
    fontSize: 12,
  },
  error: {
    marginTop: 4,
    marginLeft: 4,
    color: UI.error,
    fontSize: 12,
    fontWeight: '600',
  },

  // ---- Letters + numbers panel ----
  panel: {
    backgroundColor: UI.panelBg,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: UI.panelBorder,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 3,
    paddingHorizontal: 12,
  },
  sectionLabel: {
    color: UI.muted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: UI.line,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center', // centers the short last letter row (V-Z)
  },
  letterCell: {
    width: `${100 / 7}%`,
    padding: 3,
  },
  digitCell: {
    width: '20%',
    padding: 4,
  },

  // ---- Keys ----
  key: {
    width: '100%',
    aspectRatio: 1.05, // letters: almost square
    borderRadius: 14,
    backgroundColor: UI.keyBg,
    borderWidth: 1,
    borderColor: UI.keyBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  keyDigit: {
    aspectRatio: 1.55, // numbers: wider and larger
    borderRadius: 16,
  },
  keyPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    color: UI.text,
    fontSize: 26,
    fontWeight: '800',
  },
  keyLabelDigit: {
    fontSize: 30,
  },

  // ---- Clear / Verify ----
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  action: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(12, 36, 74, 0.85)',
    borderWidth: 1.5,
    borderColor: UI.panelBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionLabel: {
    color: UI.text,
    fontSize: 20,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.45,
  },
  verify: {
    flex: 1.1,
    height: 54,
    borderRadius: 27,
    backgroundColor: UI.verifyBg,
    borderWidth: 1.5,
    borderColor: UI.verifyBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: UI.verifyBg,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
