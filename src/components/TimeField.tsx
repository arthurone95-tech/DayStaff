import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';
import { formatClockTime, parseTimeString, partsToTimeString } from '../utils/date';

interface TimeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minuteStep?: number;
}

interface StepperProps {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}

function Stepper({ label, value, onDecrement, onIncrement }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onDecrement}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={onIncrement}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  minuteStep = 5,
}: TimeFieldProps) {
  const { hours, minutes } = parseTimeString(value);

  const shift = (deltaMinutes: number) => {
    const total = (hours * 60 + minutes + deltaMinutes + 1440) % 1440;
    onChange(
      partsToTimeString({
        hours: Math.floor(total / 60),
        minutes: total % 60,
      }),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.preview}>{formatClockTime(value)}</Text>
      </View>
      <View style={styles.steppers}>
        <Stepper
          label="Hour"
          value={String(hours).padStart(2, '0')}
          onDecrement={() => shift(-60)}
          onIncrement={() => shift(60)}
        />
        <Stepper
          label="Minute"
          value={String(minutes).padStart(2, '0')}
          onDecrement={() => shift(-minuteStep)}
          onIncrement={() => shift(minuteStep)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate700,
  },
  preview: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  steppers: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepper: {
    flex: 1,
    backgroundColor: colors.slate50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  stepperLabel: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  stepperValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
});
