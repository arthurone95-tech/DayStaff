import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '../theme';
import type { Staff } from '../types';
import { Avatar } from './Avatar';

export type StaffRowHighlight =
  | 'none'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const HIGHLIGHTS: Record<
  Exclude<StaffRowHighlight, 'none'>,
  { background: string; border: string }
> = {
  success: { background: '#F0FDF4', border: colors.success },
  warning: { background: '#FFFBEB', border: colors.warning },
  danger: { background: '#FEF2F2', border: colors.danger },
  info: { background: '#EFF6FF', border: colors.info },
};

interface StaffRowProps {
  staff: Staff;
  onPress?: () => void;
  badge?: ReactNode;
  detail?: string;
  caption?: string;
  highlight?: StaffRowHighlight;
}

export function StaffRow({
  staff,
  onPress,
  badge,
  detail,
  caption,
  highlight = 'none',
}: StaffRowProps) {
  const tones = highlight === 'none' ? null : HIGHLIGHTS[highlight];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        tones ? { backgroundColor: tones.background } : null,
        tones ? { borderLeftColor: tones.border, borderLeftWidth: 3 } : null,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <Avatar name={staff.fullName} photoUri={staff.photoUri} size={46} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {staff.fullName}
        </Text>
        {caption ? (
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        {badge}
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        {onPress ? (
          <Ionicons name="chevron-forward" size={16} color={colors.slate400} />
        ) : null}
      </View>

    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  caption: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  right: {
    alignItems: 'flex-end',
  },
  detail: {
    marginTop: 3,
    fontSize: fontSize.xs,
    color: colors.slate500,
    fontVariant: ['tabular-nums'],
  },
  resetPinButton: {
    marginLeft: spacing.md,
    padding: spacing.xs,
  },
});
