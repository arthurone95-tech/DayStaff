import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';
import type { DayStatus } from '../types';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  success: { background: colors.successSoft, text: colors.successDark },
  warning: { background: colors.warningSoft, text: colors.warningDark },
  danger: { background: colors.dangerSoft, text: colors.dangerDark },
  info: { background: colors.infoSoft, text: colors.infoDark },
  neutral: { background: colors.neutralSoft, text: colors.neutral },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const tones = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: tones.background }]}>
      <Text style={[styles.label, { color: tones.text }]}>{label}</Text>
    </View>
  );
}

export function dayStatusMeta(status: DayStatus): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case 'on_time':
      return { label: 'Present', tone: 'success' };
    case 'late':
      return { label: 'Late', tone: 'warning' };
    case 'clocked_out':
      return { label: 'Clocked out', tone: 'info' };
    case 'early_exit':
      return { label: 'Early exit', tone: 'danger' };
    default:
      return { label: 'Absent', tone: 'neutral' };
  }
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
