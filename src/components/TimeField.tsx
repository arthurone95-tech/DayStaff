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
  const isPm = hours >= 12;
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  const shift = (deltaMinutes: number) => {
    const total = (hours * 60 + minutes + deltaMinutes + 1440) % 1440;
    onChange(
      partsToTimeString({
        hours: Math.floor(total / 60),
        minutes: total % 60,
      }),
    );
  };

  const setPeriod = (period: 'AM' | 'PM') => {
    if ((period === 'PM') === isPm) {
      return;
    }
    onChange(
      partsToTimeString({
        hours: (hours % 12) + (period === 'PM' ? 12 : 0),
        minutes,
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
          value={String(displayHour).padStart(2, '0')}
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

      <View style={styles.periodRow}>
        <Text style={styles.periodCaption}>AM / PM</Text>
        <View style={styles.periodToggle}>
          {(['AM', 'PM'] as const).map((period) => {
            const active = (period === 'PM') === isPm;
            return (
              <Pressable
                key={period}
                onPress={() => setPeriod(period)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Set time to ${period}`}
                style={({ pressed }) => [
                  styles.periodButton,
                  active && styles.periodButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.periodLabel,
                    active && styles.periodLabelActive,
                  ]}
                >
                  {period}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    fontVariant: ['tabular-nums'],
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    backgroundColor: colors.slate50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  periodCaption: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  periodToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  periodButton: {
    minWidth: 58,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate500,
  },
  periodLabelActive: {
    color: colors.white,
  },
});
