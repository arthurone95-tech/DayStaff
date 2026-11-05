import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, fontSize, radius, spacing } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

const palette: Record<
  ButtonVariant,
  { background: string; text: string; border: string }
> = {
  primary: {
    background: colors.primary,
    text: colors.white,
    border: colors.primary,
  },
  secondary: {
    background: colors.infoSoft,
    text: colors.infoDark,
    border: colors.infoSoft,
  },
  ghost: {
    background: 'transparent',
    text: colors.primary,
    border: colors.border,
  },
  danger: {
    background: colors.danger,
    text: colors.white,
    border: colors.danger,
  },
  success: {
    background: colors.success,
    text: colors.white,
    border: colors.success,
  },
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  haptic = true,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const tones = palette[variant];

  const handlePress = () => {
    if (isDisabled) {
      return;
    }
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        size === 'lg' && styles.lg,
        {
          backgroundColor: tones.background,
          borderColor: tones.border,
        },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tones.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            style={[
              styles.label,
              { color: tones.text },
              size === 'sm' && styles.labelSm,
              size === 'lg' && styles.labelLg,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  lg: {
    paddingVertical: spacing.lg,
    minHeight: 58,
    borderRadius: radius.lg,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  labelSm: {
    fontSize: fontSize.sm,
  },
  labelLg: {
    fontSize: fontSize.lg,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
