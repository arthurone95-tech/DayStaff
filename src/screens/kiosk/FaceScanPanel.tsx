import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { colors, fontSize, radius, spacing } from '../../theme';

interface FaceScanPanelProps {
  busy: boolean;
  profileCount: number;
  engineAvailable: boolean | null;
  engineMessage?: string;
  onCapture: (uri: string) => void;
  onUseCode: () => void;
}

export function FaceScanPanel({
  busy,
  profileCount,
  engineAvailable,
  engineMessage,
  onCapture,
  onUseCode,
}: FaceScanPanelProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleScan = async () => {
    if (busy || !ready || !cameraRef.current) {
      return;
    }
    setCameraError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        onCapture(photo.uri);
      } else {
        setCameraError('The camera did not return a photo. Try again.');
      }
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : 'Could not capture a photo. Try again.',
      );
    }
  };

  if (profileCount === 0) {
    if (engineAvailable === null) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.kioskText} />
          <Text style={styles.loadingText}>Preparing face profiles…</Text>
        </View>
      );
    }

    const engineUnavailable = engineAvailable === false;
    return (
      <View style={styles.permissionCard}>
        <View style={styles.permissionIcon}>
          <Ionicons
            name={engineUnavailable ? 'warning-outline' : 'people-outline'}
            size={30}
            color={colors.primary}
          />
        </View>
        <Text style={styles.permissionTitle}>
          {engineUnavailable
            ? 'Face recognition unavailable'
            : 'No face profiles yet'}
        </Text>
        <Text style={styles.permissionText}>
          {engineUnavailable
            ? engineMessage ??
              'This installed build cannot run the face engine. Install the latest app build, or use the staff-code keypad for now.'
            : 'Add a clear profile photo for each staff member in the admin area, or use the staff-code keypad for now.'}
        </Text>
        <Pressable onPress={onUseCode} style={styles.linkButton}>
          <Text style={styles.linkLabel}>Use staff code instead</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.kioskText} />
        <Text style={styles.loadingText}>Preparing camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionCard}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={30} color={colors.primary} />
        </View>
        <Text style={styles.permissionTitle}>Camera access is off</Text>
        <Text style={styles.permissionText}>
          DayStaff needs the front camera to match staff profile photos. You can
          also use the staff-code keypad instead.
        </Text>
        <AppButton
          title={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
          onPress={() => {
            if (permission.canAskAgain) {
              void requestPermission();
            } else {
              void Linking.openSettings();
            }
          }}
          size="sm"
        />
        <Pressable onPress={onUseCode} style={styles.linkButton}>
          <Text style={styles.linkLabel}>Use staff code instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.cameraFrame}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          onCameraReady={() => setReady(true)}
          onMountError={(event) =>
            setCameraError(event?.message ?? 'The camera could not start.')
          }
        />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.oval} />
        </View>
        {busy || !ready ? (
          <View style={styles.cameraBusy}>
            {cameraError ? (
              <Ionicons
                name="warning-outline"
                size={28}
                color={colors.white}
              />
            ) : (
              <ActivityIndicator color={colors.white} size="large" />
            )}
            <Text style={styles.cameraBusyText}>
              {busy
                ? 'Matching your face…'
                : cameraError
                  ? 'Camera unavailable'
                  : 'Starting camera…'}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.instruction}>
        Look straight at the camera and keep your face inside the oval.
      </Text>
      <Text style={styles.subInstruction}>
        {profileCount} face {profileCount === 1 ? 'profile' : 'profiles'} ready
        · matching happens on this device
      </Text>

      {engineAvailable === false ? (
        <Text style={styles.warning}>
          This build is using a basic fallback matcher. Install the latest app
          build for full face recognition.
        </Text>
      ) : null}

      {cameraError ? <Text style={styles.error}>{cameraError}</Text> : null}

      <AppButton
        title={busy ? 'Matching…' : 'Scan my face'}
        onPress={handleScan}
        loading={busy}
        disabled={!ready || busy}
        size="lg"
        style={styles.scanButton}
        icon={
          busy ? undefined : (
            <Ionicons name="scan-outline" size={20} color={colors.white} />
          )
        }
      />

      <Pressable
        onPress={onUseCode}
        disabled={busy}
        style={({ pressed }) => [
          styles.linkButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name="keypad-outline"
          size={16}
          color={colors.kioskMuted}
        />
        <Text style={styles.linkLabel}>Use staff code instead</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Face matching runs entirely on this device. If the match is close but
        not certain, you will be asked to confirm before attendance is recorded.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  permissionIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  permissionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  permissionText: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.slate500,
    textAlign: 'center',
  },
  cameraFrame: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    maxHeight: 330,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.kioskSurface,
    borderWidth: 2,
    borderColor: colors.kioskSurfaceRaised,
    alignSelf: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oval: {
    width: '58%',
    aspectRatio: 0.78,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cameraBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 27, 43, 0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cameraBusyText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  instruction: {
    marginTop: spacing.md,
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  subInstruction: {
    marginTop: spacing.xs,
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  warning: {
    marginTop: spacing.sm,
    color: '#FCD34D',
    fontSize: fontSize.xs,
    lineHeight: 17,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.sm,
    color: '#FCA5A5',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  scanButton: {
    marginTop: spacing.md,
  },
  linkButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  linkLabel: {
    color: colors.kioskMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    marginTop: spacing.sm,
    color: colors.kioskMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
});
