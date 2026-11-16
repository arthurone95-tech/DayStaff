import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STAFF_CODE_MAX_LENGTH } from '../../config/app';

/**
 * Local palette for the kiosk keypad.
 */
const UI = {
  panelBg: 'rgba(12, 36, 74, 0.72)',
  panelBorder: 'rgba(59, 130, 246, 0.5)',
  keyBg: '#0F2D57',
  keyBorder: 'rgba(96, 165, 250, 0.4)',
  keyActiveBg: '#1E6BFF',
  keyActiveBorder: '#5AA2FF',
  fieldBorder: '#2F7BFF',
  text: '#FFFFFF',
  muted: '#A9BCE0',
  dimmed: 'rgba(169, 188, 224, 0.35)',
  line: 'rgba(59, 130, 246, 0.45)',
  error: '#FCA5A5',
} as const;

/** Approved letters and numbers — must match the kiosk short-code system. */
const APPROVED_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
const APPROVED_NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const INACTIVITY_RESET_MS = 3500;

interface CodeKeypadProps {
  code: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: (code?: string) => void;
}

function KeyButton({
  value,
  disabled,
  dimmed,
  onPress,
}: {
  value: string;
  disabled: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Enter ${value}`}
      style={({ pressed }) => [
        styles.key,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
        dimmed && styles.keyDimmed,
      ]}
    >
      <Text style={[styles.keyLabel, dimmed && styles.keyLabelDimmed]}>
        {value}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ label, dimmed }: { label: string; dimmed: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={[styles.sectionLabel, dimmed && styles.sectionLabelDimmed]}>
        {label}
      </Text>
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

  const letterSelected = code.length >= 1;
  const numberSelected = code.length >= 2;

  // Inactivity reset: if a letter is selected but no number within 3.5s, reset
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (letterSelected && !numberSelected) {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        onChange('');
      }, INACTIVITY_RESET_MS);
    } else {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    }
    return () => {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    };
  }, [letterSelected, numberSelected, onChange]);

  const handleLetterPress = (letter: string) => {
    if (disabled || letterSelected) return;
    tap();
    onChange(letter);
  };

  const handleNumberPress = (num: string) => {
    if (disabled || !letterSelected || numberSelected) return;
    tap();
    const next = (code[0] || '') + num;
    onChange(next);
    // Auto-verify on second character
    setTimeout(() => {
      onSubmit(next);
    }, 50);
  };

  const clear = () => {
    if (disabled) return;
    tap();
    onChange('');
  };

  const displayCode = code.length === 0 ? '' : code;
  const letterDimmed = letterSelected; // dim letters once a letter is chosen
  const numberDimmed = !letterSelected; // dim numbers until a letter is chosen

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
              {code.length === 0
                ? '_  _'
                : code.length === 1
                ? `${code}  _`
                : code}
            </Text>
            <Text style={styles.displayCount}>
              {code.length}/{STAFF_CODE_MAX_LENGTH}
            </Text>
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : hint ? (
            <Text style={styles.hint}>{hint}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={clear}
          disabled={disabled || code.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear code"
          style={({ pressed }) => [
            styles.clearButton,
            pressed && styles.keyPressed,
            (disabled || code.length === 0) && styles.actionDisabled,
          ]}
        >
          <Ionicons name="trash-outline" size={20} color={UI.text} />
          <Text style={styles.clearButtonLabel}>Clear</Text>
        </Pressable>
      </View>

      {letterSelected ? (
        /* Numbers section */
        <View style={[styles.panel, styles.numberPanel]}>
          <SectionHeader label="Select number" dimmed={false} />
          <View style={styles.gridRow}>
            {APPROVED_NUMBERS.map((key) => (
              <View key={key} style={styles.digitCell}>
                <KeyButton
                  value={key}
                  disabled={disabled || numberSelected}
                  dimmed={false}
                  onPress={() => handleNumberPress(key)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : (
        /* Letters section */
        <View style={styles.panel}>
          <SectionHeader label="Select letter" dimmed={false} />
          <View style={styles.gridRow}>
            {APPROVED_LETTERS.map((key) => (
              <View key={key} style={styles.letterCell}>
                <KeyButton
                  value={key}
                  disabled={disabled}
                  dimmed={false}
                  onPress={() => handleLetterPress(key)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

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
    gap: 10,
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
  clearButton: {
    height: 46,
    minWidth: 76,
    borderRadius: 20,
    backgroundColor: 'rgba(12, 36, 74, 0.85)',
    borderWidth: 1.5,
    borderColor: UI.panelBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  clearButtonLabel: {
    color: UI.text,
    fontSize: 16,
    fontWeight: '700',
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
    width: 132,
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
    marginBottom: 8,
  },
  numberPanel: {
    marginTop: 0,
  },
  panelDimmed: {
    opacity: 0.45,
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
  sectionLabelDimmed: {
    color: UI.dimmed,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: UI.line,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  letterCell: {
    width: '20%',
    padding: 4,
  },
  digitCell: {
    width: '20%',
    padding: 4,
  },

  // ---- Keys ----
  key: {
    width: '100%',
    aspectRatio: 1.1,
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
  keyPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyDimmed: {
    opacity: 0.35,
  },
  keyLabel: {
    color: UI.text,
    fontSize: 26,
    fontWeight: '800',
  },
  keyLabelDimmed: {
    color: UI.dimmed,
  },

  // ---- Clear ----
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
});
