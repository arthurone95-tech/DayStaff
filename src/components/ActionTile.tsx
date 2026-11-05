import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';

interface ActionTileProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'success' | 'warning' | 'info';
}

const ICON_TONES = {
  primary: { background: colors.infoSoft, icon: colors.primary },
  success: { background: colors.successSoft, icon: colors.successDark },
  warning: { background: colors.warningSoft, icon: colors.warningDark },
  info: { background: colors.infoSoft, icon: colors.infoDark },
} as const;

export function ActionTile({
  icon,
  label,
  onPress,
  tone = 'primary',
}: ActionTileProps) {
  const iconTone = ICON_TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconTone.background }]}>
        <Ionicons name={icon} size={22} color={iconTone.icon} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate700,
  },
});
