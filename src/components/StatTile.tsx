import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';
import type { BadgeTone } from './Badge';

const TONES: Record<BadgeTone, { background: string; value: string }> = {
  success: { background: colors.successSoft, value: colors.successDark },
  warning: { background: colors.warningSoft, value: colors.warningDark },
  danger: { background: colors.dangerSoft, value: colors.dangerDark },
  info: { background: colors.infoSoft, value: colors.infoDark },
  neutral: { background: colors.neutralSoft, value: colors.neutral },
};

interface StatTileProps {
  label: string;
  value: number;
  tone: BadgeTone;
}

export function StatTile({ label, value, tone }: StatTileProps) {
  const tones = TONES[tone];
  return (
    <View style={[styles.tile, { backgroundColor: tones.background }]}>
      <Text style={[styles.value, { color: tones.value }]}>{value}</Text>
      <Text style={[styles.label, { color: tones.value }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  value: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
