import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './Avatar';
import { AppButton } from './AppButton';
import { getStaffById } from '../database/queries';
import {
  clearPersonalPinFailuresForStaff,
  PERSONAL_PIN_LENGTH,
  PIN_ENTRY_TIMEOUT_MS,
  PIN_MAX_ATTEMPTS,
  recordPersonalPinFailureForStaff,
  verifyPersonalPin,
} from '../services/lookalikeService';
import { colors, fontSize, radius, spacing } from '../theme';
import { playErrorSound } from '../services/kioskSound';

interface PersonalPinModalProps {
  visible: boolean;
  staffId?: number | null;
  personName?: string;
  personPhotoUri?: string | null;
  mode?: 'verify' | 'create';
  onClose: () => void;
  onSuccess: (pin: string) => void;
}

export function PersonalPinModal({
  visible,
  staffId = null,
  personName = '',
  personPhotoUri = null,
  mode = 'verify',
  onClose,
  onSuccess,
}: PersonalPinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetAutoClose = () => {
    if (autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }
    if (mode === 'verify' && visible) {
      autoCloseTimer.current = setTimeout(() => {
        onClose();
      }, PIN_ENTRY_TIMEOUT_MS);
    }
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPin('');
    setConfirmPin('');
    setPhase('enter');
    setError(null);
    setChecking(false);
    if (mode === 'verify' && staffId !== null) {
      const staff = getStaffById(staffId);
      setLockedUntil(staff?.personalPinLockedUntil ?? null);
    } else {
      setLockedUntil(null);
    }
    resetAutoClose();
    return () => {
      if (autoCloseTimer.current) {
        clearTimeout(autoCloseTimer.current);
        autoCloseTimer.current = null;
      }
    };
  }, [visible, mode, staffId]);

  const shakeDots = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const locked = mode === 'verify' && lockedUntil !== null && lockedUntil > Date.now();

  useEffect(() => {
    if (!lockedUntil) {
      setRemaining(0);
      return;
    }
    const update = () => {
      const ms = lockedUntil - Date.now();
      if (ms <= 0) {
        setLockedUntil(null);
        setRemaining(0);
      } else {
        setRemaining(Math.ceil(ms / 1000));
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const submitVerify = async (value: string) => {
    if (staffId === null) {
      setError('PIN not set. Please ask the administrator.');
      setPin('');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const valid = await verifyPersonalPin(staffId, value);
      if (valid) {
        clearPersonalPinFailuresForStaff(staffId);
        onSuccess(value);
        return;
      }
      void playErrorSound();
      const result = await recordPersonalPinFailureForStaff(staffId);
      shakeDots();
      setPin('');
      if (result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
        setError(`Too many attempts. Try again in ${Math.ceil((result.lockedUntil - Date.now()) / 1000)}s.`);
      } else {
        const triesLeft = PIN_MAX_ATTEMPTS - result.attempts;
        setError(`Incorrect PIN. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`);
      }
    } catch {
      void playErrorSound();
      setError('Could not verify the PIN. Please try again.');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (locked || checking) return;
    resetAutoClose();
    const current = phase === 'enter' ? pin : confirmPin;
    if (current.length >= PERSONAL_PIN_LENGTH) return;
    const next = current + digit;
    if (phase === 'enter') {
      setPin(next);
      if (next.length === PERSONAL_PIN_LENGTH) {
        if (mode === 'create') {
          setPhase('confirm');
        } else {
          void submitVerify(next);
        }
      }
    } else {
      setConfirmPin(next);
      if (next.length === PERSONAL_PIN_LENGTH) {
        if (confirmPin + digit === pin) {
          onSuccess(pin);
        } else {
          void playErrorSound();
          shakeDots();
          setError('PINs do not match. Try again.');
          setPin('');
          setConfirmPin('');
          setPhase('enter');
        }
      }
    }
  };

  const handleBackspace = () => {
    if (locked || checking) return;
    resetAutoClose();
    if (phase === 'enter') {
      setPin((value) => value.slice(0, -1));
    } else {
      setConfirmPin((value) => value.slice(0, -1));
    }
    setError(null);
  };

  const currentPin = phase === 'enter' ? pin : confirmPin;

  // Lock state needs the persisted value. We read it through a small effect by
  // asking the parent is not possible, so derive from staffId by querying the
  // database lazily here.
  useEffect(() => {
    if (!visible || mode !== 'verify' || staffId === null) return;
    // The query helpers are synchronous; import them dynamically to avoid a
    // circular dependency at module load.
    const { getStaffById } = require('../database/queries');
    const staff = getStaffById(staffId);
    if (staff) {
      setLockedUntil(staff.personalPinLockedUntil);
    }
  }, [visible, mode, staffId]);

  if (!visible) return null;

  const name = personName || 'Staff member';
  const photo = personPhotoUri;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Avatar name={name} photoUri={photo} size={72} />
          <Text style={styles.title}>Enter your PIN</Text>
          <Text style={styles.subtitle}>{name}</Text>

          {locked ? (
            <Text style={styles.lockText}>
              Too many attempts. Try again in {remaining}s.
            </Text>
          ) : (
            <>
              <Animated.View
                style={[styles.dotsRow, { transform: [{ translateX: shake }] }]}
              >
                {Array.from({ length: PERSONAL_PIN_LENGTH }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      index < currentPin.length ? styles.dotFilled : styles.dotEmpty,
                    ]}
                  />
                ))}
              </Animated.View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {mode === 'create' && phase === 'confirm' ? (
                <Text style={styles.hint}>Confirm your PIN</Text>
              ) : null}

              <View style={styles.keypad}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                  <Pressable
                    key={digit}
                    style={styles.key}
                    onPress={() => handleDigit(String(digit))}
                    disabled={locked || checking}
                  >
                    <Text style={styles.keyText}>{digit}</Text>
                  </Pressable>
                ))}
                <View style={styles.keySpacer} />
                <Pressable
                  style={styles.key}
                  onPress={() => handleDigit('0')}
                  disabled={locked || checking}
                >
                  <Text style={styles.keyText}>0</Text>
                </Pressable>
                <Pressable
                  style={styles.key}
                  onPress={handleBackspace}
                  disabled={locked || checking}
                >
                  <Text style={styles.keyText}>⌫</Text>
                </Pressable>
              </View>
            </>
          )}

          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    marginTop: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.slate500,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: spacing.lg,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotEmpty: {
    backgroundColor: 'transparent',
    borderColor: colors.slate400,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.danger,
    textAlign: 'center',
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.slate500,
  },
  lockText: {
    marginTop: spacing.lg,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
  },
  keypad: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    width: 220,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.slate900,
  },
  keySpacer: {
    width: 64,
    height: 64,
  },
  cancelButton: {
    marginTop: spacing.lg,
  },
  cancelText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate500,
  },
});