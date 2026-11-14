import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSize, radius, spacing } from '../theme';

interface QrScannerProps {
  active: boolean;
  onScanned: (value: string) => void;
  /** Change this value to allow the same QR to be scanned again. */
  resetKey?: string | number;
  /** Square edge length of the camera preview. */
  size?: number;
}

/**
 * Back-camera QR scanner used for the phone -> kiosk leg of the visual
 * two-way flow. It ignores repeated callbacks until `resetKey` changes.
 */
export function QrScanner({
  active,
  onScanned,
  resetKey = 0,
  size = 230,
}: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    handledRef.current = false;
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, [resetKey, active]);

  useEffect(
    () => () => {
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current);
      }
    },
    [],
  );

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      if (!active || handledRef.current) {
        return;
      }
      handledRef.current = true;
      // Let the caller show an error, then allow the same QR to be retried
      // without the camera firing the callback on every frame.
      cooldownRef.current = setTimeout(() => {
        handledRef.current = false;
        cooldownRef.current = null;
      }, 1400);
      onScanned(data);
    },
    [active, onScanned],
  );

  if (!permission) {
    return (
      <View style={[styles.placeholder, { width: size, height: size }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.placeholder, { width: size, height: size }]}>
        <Ionicons name="camera-outline" size={34} color={colors.kioskMuted} />
        <Text style={styles.permissionText}>
          Camera access is needed to scan the phone QR.
        </Text>
        <Pressable
          onPress={() => void requestPermission()}
          style={({ pressed }) => [
            styles.permissionButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.permissionButtonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cameraFrame,
        { width: size, height: size, borderRadius: radius.lg },
      ]}
    >
      <CameraView
        facing="back"
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={active ? handleScanned : undefined}
      />
      <View pointerEvents="none" style={styles.scanFrame} />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    overflow: 'hidden',
    backgroundColor: '#020A18',
    borderWidth: 2,
    borderColor: 'rgba(96, 165, 250, 0.7)',
  },
  scanFrame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '12%',
    bottom: '12%',
    borderWidth: 2,
    borderColor: 'rgba(52, 245, 181, 0.8)',
    borderRadius: radius.md,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(96, 165, 250, 0.4)',
    backgroundColor: 'rgba(12, 36, 74, 0.72)',
  },
  permissionText: {
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  permissionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
