import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';
import type { AuthMethod } from '../types';

interface AuthMethodPickerProps {
  value: AuthMethod;
  onChange: (value: AuthMethod) => void;
  disabled?: boolean;
}

// Face recognition remains the primary/default method. The administrator can
// switch the kiosk to the short-code + two-way visual QR method instead.
const OPTIONS: Array<{
  value: AuthMethod;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  recommended?: boolean;
}> = [
  {
    value: 'FACE_RECOGNITION',
    title: 'Face recognition',
    description:
      'Staff look at the camera and the app matches the capture against profile photos. Best with clear, front-facing photos.',
    icon: 'scan-outline',
    recommended: true,
  },
];

export function AuthMethodPicker({
  value,
  onChange,
  disabled = false,
}: AuthMethodPickerProps) {
  return (
    <View style={styles.list}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && !disabled ? styles.pressed : null,
              disabled && styles.disabled,
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                selected && styles.iconWrapSelected,
              ]}
            >
              <Ionicons
                name={option.icon}
                size={22}
                color={selected ? colors.white : colors.primary}
              />
            </View>

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{option.title}</Text>
              </View>
              <Text style={styles.description}>{option.description}</Text>
            </View>

            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? colors.primary : colors.slate300}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.infoSoft,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: {
    backgroundColor: colors.primary,
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  badge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.successDark,
  },
  description: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.slate500,
  },
});
