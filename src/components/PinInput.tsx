import { useRef, useState, type ComponentRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';

interface PinInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
  autoFocus?: boolean;
  error?: string;
  placeholder?: string;
}

export function PinInput({
  value,
  onChangeText,
  onSubmit,
  maxLength = 8,
  autoFocus = false,
  error,
  placeholder = 'Enter PIN',
}: PinInputProps) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.wrapper,
          focused && styles.wrapperFocused,
          error ? styles.wrapperError : null,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))}
          onSubmitEditing={onSubmit}
          maxLength={maxLength}
          keyboardType="number-pad"
          secureTextEntry
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={colors.slate400}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            value.length > 0 && styles.inputWithValue,
          ]}
          accessibilityLabel="Administrator PIN"
        />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.slate50,
    paddingHorizontal: spacing.md,
  },
  wrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  wrapperError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    height: 54,
    fontSize: fontSize.xl,
    textAlign: 'center',
    color: colors.slate900,
    fontWeight: '600',
  },
  inputWithValue: {
    letterSpacing: 10,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.danger,
    fontSize: fontSize.sm,
  },
});
