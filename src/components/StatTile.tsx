import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  onPress?: () => void;
}

// OPTION 5: Split card. Tinted top with the number, white footer bar with label + chevron (reads like a button).
export function StatTile({ label, value, tone, onPress }: StatTileProps) {
  const tones = TONES[tone];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View style={styles.card}>
        <View style={[styles.top, { backgroundColor: tones.background }]}>
          <Text style={[styles.value, { color: tones.value }]}>{value}</Text>
        </View>
        <View style={styles.footer}>
          <Text style={[styles.label, { color: tones.value }]} numberOfLines={2}>
            {label}
          </Text>
          {onPress ? (
            <Ionicons name="chevron-forward" size={14} color={tones.value} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flexGrow: 1, flexBasis: '30%', minWidth: 96 },
  card: {
    height: 112,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: fontSize.xxl, fontWeight: '800', fontVariant: ['tabular-nums'] },
  footer: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: fontSize.xs + 2,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
});
