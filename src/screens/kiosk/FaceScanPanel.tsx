import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { useFacePictureSize, FACE_PHOTO_QUALITY } from '../../hooks/useFacePictureSize';
import { getScanLightEnabled } from '../../services/appSettings';
import {
  analyzeFace,
  prepareFaceEngine,
  prepareFacePhoto,
  type FaceAnalysis,
} from '../../services/faceEngine';
import {
  captureChallengeFrames,
  LIVENESS_STEPS,
  scanTimerMark,
  scanTimerStart,
  verifyLiveness,
} from '../../services/faceLiveness';
import { colors, fontSize, radius, spacing } from '../../theme';

const FRAME_SIZE = 320;

type ScanPhase = 'idle' | 'capturing' | 'verifying';

interface FaceScanPanelProps {
  busy: boolean;
  profileCount: number;
  engineAvailable: boolean | null;
  engineMessage?: string;
  /**
   * Called with the verified live-scan frames and their averaged embedding.
   * The kiosk matches these against staff profiles.
   */
  onScanned: (
    frames: string[],
    embedding: number[] | null,
    frameEmbeddings?: number[][] | null,
  ) => void | Promise<void>;
  onScanStart?: () => void;
  onScanEnd?: () => void;
  onUseCode?: () => void;
  onError?: (message: string) => void;
  /** Increment to auto-trigger a scan once the camera is ready. */
  triggerScan?: number;
  /** Show a camera flip control (useful when an admin scans another person). */
  showCameraFlip?: boolean;
}

export function FaceScanPanel({
  busy,
  profileCount,
  engineAvailable,
  engineMessage,
  onScanned,
  onScanStart,
  onScanEnd,
  onUseCode,
  onError,
  triggerScan,
  showCameraFlip = false,
}: FaceScanPanelProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const { pictureSize, chooseSize } = useFacePictureSize(cameraRef);
  const isFocused = useIsFocused();
  const [cameraRetry, setCameraRetry] = useState(0);
  const [torchOn, setTorchOn] = useState(false);

  // Controlled camera mount recovery. When CameraView fails to mount (onMountError),
  // automatically retry a bounded number of times instead of leaving a black screen
  // until the user taps "Retry camera" or navigates away and back.
  const MAX_CAMERA_MOUNT_RETRIES = 3;
  const [mountAttempts, setMountAttempts] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending auto-retry timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Auto-retry the camera after a mount failure, up to MAX_CAMERA_MOUNT_RETRIES.
  // Resets when the camera successfully mounts or the user manually retries.
  useEffect(() => {
    if (!cameraError || ready || mountAttempts >= MAX_CAMERA_MOUNT_RETRIES) {
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setCameraError(null);
      setMountAttempts((a) => a + 1);
    }, 1500);
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [cameraError, ready, mountAttempts]);

  // Surface camera failures as a pop-up instead of inline status text.
  useEffect(() => {
    if (cameraError && mountAttempts >= MAX_CAMERA_MOUNT_RETRIES) {
      onError?.(cameraError);
    }
  }, [cameraError, mountAttempts, onError]);

  // Remount camera when focus returns
  useEffect(() => {
    if (isFocused) {
      setReady(false);
      setCameraError(null);
      setCameraKey((k) => k + 1);
    }
  }, [isFocused]);
  // Admin setting: bright screen light around the camera while photos are taken.
  const [lightEnabled, setLightEnabled] = useState(getScanLightEnabled());

  // Continuous scan-line animation across the camera frame.
  const scanProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanProgress, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanProgress]);

  const scanLineTranslate = scanProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, FRAME_SIZE - 14],
  });

  const scanning = phase !== 'idle';
  // Light is on from the tap until the third photo is taken, then off.
  const lightOn = lightEnabled && torchOn;

  // Always release the torch when the component unmounts or scanning stops.
  // The CameraView receives enableTorch={scanning}, so when scanning ends the
  // torch is turned off. On unmount we reset phase so a remount starts fresh.
  useEffect(() => {
    return () => {
      setPhase('idle');
    };
  }, [scanning]);

  // When returning to the kiosk terminal (e.g. via the padlock), reset the
  // camera state and remount the CameraView so the preview comes back bright
  // instead of black. Forcing a remount re-applies enableTorch from scratch.
  useFocusEffect(
    useCallback(() => {
      setPhase('idle');
      setStepIndex(0);
      setHint(null);
      setCameraError(null);
      setReady(false);
      setLightEnabled(getScanLightEnabled());
      setCameraKey((k) => k + 1);
    }, []),
  );

  const handleScan = async () => {
    if (busy || scanning || !ready || !cameraRef.current) return;
    setCameraError(null);
    scanTimerStart();
    setTorchOn(true);
    setPhase('capturing');
    setStepIndex(0);
    setHint(LIVENESS_STEPS[0]?.hint ?? null);
    onScanStart?.();
    try {
      const shutter = () =>
        cameraRef.current!.takePictureAsync({
          quality: FACE_PHOTO_QUALITY,
          base64: false,
          skipProcessing: false,
        });
      // Start reading each frame as soon as it is saved, while the user is
      // still turning for the next one.
      const embeddingJobs: Promise<FaceAnalysis>[] = [];
      const frames = await captureChallengeFrames(
        shutter,
        LIVENESS_STEPS,
        (index) => {
          setStepIndex(index);
          setHint(LIVENESS_STEPS[index]?.hint ?? null);
        },
        (uri, index) => {
          scanTimerMark(`frame ${index + 1} captured`);
          const job = prepareFacePhoto(uri).then((upright) => analyzeFace(upright));
          job.catch(() => undefined); // errors are handled when awaited below
          embeddingJobs.push(job);
        },
      );
      scanTimerMark('all frames captured');

      // The scan light goes off here: it is only on while photos are taken.
      setPhase('verifying');
      setHint('Verifying it is a live scan…');

      const engineReady = await prepareFaceEngine();
      if (!engineReady) {
        const message =
          'Face recognition is not available in this build. Install the latest DayStaff build.';
        setPhase('idle');
        setHint(null);
        setCameraError(message);
        onError?.(message);
        return;
      }

      const liveness = await verifyLiveness(frames, embeddingJobs);
      scanTimerMark('liveness verified');
      if (!liveness.ok) {
        const message =
          liveness.message ?? 'The liveness check failed. Try again.';
        setPhase('idle');
        setHint(null);
        setCameraError(message);
        onError?.(message);
        return;
      }

      setPhase('verifying');
      setHint('Matching your face…');
      try {
        await onScanned(liveness.frames, liveness.embedding, liveness.embeddings);
      } finally {
        setPhase('idle');
        setHint(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not complete the scan. Try again.';
      setPhase('idle');
      setHint(null);
      setCameraError(message);
      onError?.(message);
    } finally {
      setTorchOn(false);
      onScanEnd?.();
    }
  };

  const lastScannedTriggerRef = useRef<number>(triggerScan ?? 0);
  useEffect(() => {
    if (triggerScan === undefined) return;
    if (triggerScan === lastScannedTriggerRef.current) return;
    if (!ready || busy || scanning || !cameraRef.current) return;
    lastScannedTriggerRef.current = triggerScan;
    void handleScan();
  }, [triggerScan, ready, busy, scanning]);

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
          {engineUnavailable ? 'Face recognition unavailable' : 'No face profiles yet'}
        </Text>
        <Text style={styles.permissionText}>
          {engineUnavailable
            ? engineMessage ??
              'This installed build cannot run the face engine. Install the latest app build.'
            : 'Add a clear profile photo for each staff member in the admin area.'}
        </Text>
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
          DayStaff needs the front camera to match staff profile photos.
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
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.lightWrap}>
        {lightOn ? (
          <View pointerEvents="none" style={styles.lightGlow} />
        ) : null}
      <View style={styles.cameraFrame}>
        {isFocused ? (
          <CameraView
            key={cameraKey + cameraRetry}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            enableTorch={lightOn}
            pictureSize={pictureSize}
            onCameraReady={() => {
              setMountAttempts(0);
              setReady(true);
              setCameraError(null);
              void chooseSize();
            }}
            onMountError={(event) => {
              setCameraError(event?.message ?? 'The camera could not start.');
              setReady(false);
            }}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}

        {/* Face guide oval */}
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.oval} />
        </View>

        {/* Corner brackets */}
        <View pointerEvents="none" style={styles.bracketTopLeft} />
        <View pointerEvents="none" style={styles.bracketTopRight} />
        <View pointerEvents="none" style={styles.bracketBottomLeft} />
        <View pointerEvents="none" style={styles.bracketBottomRight} />

        {/* Animated scan line */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { transform: [{ translateY: scanLineTranslate }] },
          ]}
        />

        {showCameraFlip ? (
          <Pressable
            onPress={() =>
              setFacing((prev) => (prev === 'front' ? 'back' : 'front'))
            }
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
            style={styles.cameraFlipButton}
          >
            <Ionicons name="camera-reverse-outline" size={20} color={colors.white} />
          </Pressable>
        ) : null}

        {busy || scanning || !ready ? (
          <View style={styles.cameraBusy}>
            {cameraError && !scanning ? (
              <Ionicons name="warning-outline" size={28} color={colors.white} />
            ) : (
              <ActivityIndicator color={colors.white} size="large" />
            )}
            <Text style={styles.cameraBusyText}>
              {!ready
                ? 'Starting camera…'
                : scanning
                  ? phase === 'verifying'
                    ? 'Verifying…'
                    : `Scanning · step ${Math.min(stepIndex + 1, LIVENESS_STEPS.length)} of ${LIVENESS_STEPS.length}`
                  : 'Matching your face…'}
            </Text>
          </View>
        ) : null}
      </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  loading: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: { color: colors.kioskMuted, fontSize: fontSize.sm },
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
  lightWrap: {
    width: '100%',
    maxWidth: FRAME_SIZE,
    alignSelf: 'center',
  },
  // Bright white area behind and around the camera preview: lights the face
  // while the photos are taken. Positioned outside the frame, so the layout
  // (and the one-screen fit) does not change.
  lightGlow: {
    position: 'absolute',
    top: -26,
    left: -26,
    right: -26,
    bottom: -26,
    borderRadius: radius.xl + 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  cameraFrame: {
    width: '100%',
    maxWidth: FRAME_SIZE,
    height: FRAME_SIZE,
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
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oval: {
    width: '58%',
    aspectRatio: 0.78,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bracketTopLeft: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 34,
    height: 34,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#5AA2FF',
    borderTopLeftRadius: 14,
  },
  bracketTopRight: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#5AA2FF',
    borderTopRightRadius: 14,
  },
  bracketBottomLeft: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    width: 34,
    height: 34,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#5AA2FF',
    borderBottomLeftRadius: 14,
  },
  bracketBottomRight: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 34,
    height: 34,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#5AA2FF',
    borderBottomRightRadius: 14,
  },
  scanLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(90, 162, 255, 0.9)',
  },
  cameraBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11, 27, 43, 0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cameraBusyText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.kioskSurfaceRaised,
  },
  dotActive: { backgroundColor: '#5AA2FF', width: 20 },
  dotDone: { backgroundColor: '#34F5B5' },
  instruction: {
    marginTop: spacing.md,
    color: colors.kioskText,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    marginTop: spacing.sm,
    color: '#FCA5A5',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  retryRow: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.kioskSurface,
  },
  scanButton: { marginTop: spacing.md },
  cameraFlipButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  useCodeButton: { marginTop: spacing.xs },
});
