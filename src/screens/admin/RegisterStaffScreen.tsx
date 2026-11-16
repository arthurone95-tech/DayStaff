import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Switch,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';

import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import {
  STAFF_CODE_MAX_LENGTH,
} from '../../config/app';
import {
  createStaff,
  isStaffCodeTaken,
} from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import type { Staff } from '../../types';
import {
  analyzeFace,
  FaceEngineUnavailableError,
  FacePhotoError,
  prepareFaceEngine,
  prepareFacePhoto,
  serializeFaceEmbedding,
  type FaceAnalysis,
} from '../../services/faceEngine';
import {
  captureChallengeFrames,
  LIVENESS_STEPS,
  verifyLiveness,
} from '../../services/faceLiveness';
import {
  createStaffFaceSignature,
  findDuplicateFace,
} from '../../services/faceRecognitionService';
import { FACE_PHOTO_QUALITY, useFacePictureSize } from '../../hooks/useFacePictureSize';
import {
  chooseStaffPhoto,
  captureStaffPhoto,
} from '../../services/photoService';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

/**
 * Registration is now three distinct steps:
 *  1. Basic info + fallback PIN.
 *  2. PROFILE PHOTO — a normal picture (camera or gallery) used for the
 *     staff list, reports and the confirmation modal.
 *  3. LIVE FACE SCAN — a guided multi-frame scan that builds the face
 *     profile used for recognition. This is NOT the profile photo.
 */
export function RegisterStaffScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert } = useAppDialog();


  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [consent, setConsent] = useState(false);
  const [registeredInfo, setRegisteredInfo] = useState<{ name: string; code: string } | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
  }>({});
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (step === 2) {
              setStep(1);
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        >
          <Ionicons name="chevron-back" size={26} color={colors.white} />
        </Pressable>
      ),
    });
  }, [navigation, step]);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoCameraType, setPhotoCameraType] = useState<ImagePicker.CameraType>(ImagePicker.CameraType.back);
  const [scanCameraType, setScanCameraType] = useState<ImagePicker.CameraType>(ImagePicker.CameraType.front);
  const [faceSignature, setFaceSignature] = useState<string | null>(null);

  const [faceBusy, setFaceBusy] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [pinCheckBusy, setPinCheckBusy] = useState(false);
  const [faceCheckBusy, setFaceCheckBusy] = useState(false);
  const [duplicateFaceStaff, setDuplicateFaceStaff] = useState<Staff | null>(null);
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const { pictureSize, chooseSize } = useFacePictureSize(cameraRef);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const goToPreviousStep = () => {
    setStep((current) => (current > 1 ? 1 : current));
  };

  const validateBasic = (): boolean => {
    const next: { name?: string } = {};
    if (!fullName.trim()) {
      next.name = 'Full name is required.';
    }
    if (!consent) {
      next.name = next.name ?? 'Please confirm biometric consent.';
    }
    setErrors((prev) => ({
      ...prev,
      name: next.name,
    }));
    return Object.keys(next).length === 0;
  };

  // -------------------------------------------------------------------------
  // Step 2 — profile photo
  // -------------------------------------------------------------------------

  const handleTakePhoto = async (cameraType: ImagePicker.CameraType = photoCameraType) => {
    try {
      const uri = await captureStaffPhoto(cameraType);
      if (uri) setPhotoUri(uri);
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not take photo',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleChoosePhoto = async () => {
    try {
      const uri = await chooseStaffPhoto();
      if (uri) setPhotoUri(uri);
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not choose photo',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Step 3 — live face scan
  // -------------------------------------------------------------------------

  const handleFaceScan = async () => {
    if (!cameraRef.current || faceBusy) return;
    setFaceBusy(true);
    setFaceError(null);
    // Every scan starts clean. Before, a previous "already registered" result
    // stayed set forever, so Save stayed blocked until the screen was closed.
    setFaceSignature(null);
    setDuplicateFaceStaff(null);
    try {
      const engineReady = await prepareFaceEngine();
      const shutter = () =>
        cameraRef.current!.takePictureAsync({
          quality: FACE_PHOTO_QUALITY,
          base64: false,
          skipProcessing: false,
        });
      // Read each photo as soon as it is saved, while the next prompt is shown.
      const jobs: Promise<FaceAnalysis>[] = [];
      const frames = await captureChallengeFrames(
        shutter,
        LIVENESS_STEPS,
        (index) => setScanHint(LIVENESS_STEPS[index]?.hint ?? null),
        (uri) => {
          if (!engineReady) return;
          const job = prepareFacePhoto(uri).then((upright) => analyzeFace(upright));
          job.catch(() => undefined); // errors are handled when awaited below
          jobs.push(job);
        },
      );
      setScanHint('Building face profile…');

      let signature: string;
      let frameEmbeddings: number[][] | null = null;
      if (engineReady) {
        // Same head-turn check as the kiosk, so a photo cannot be enrolled.
        const liveness = await verifyLiveness(frames, jobs);
        if (!liveness.ok || !liveness.embedding) {
          throw new FacePhotoError(
            liveness.message ?? 'The head-turn check failed. Please try again.',
          );
        }
        signature = serializeFaceEmbedding(liveness.embedding);
        frameEmbeddings = liveness.embeddings;
      } else {
        const enrollment = await createStaffFaceSignature(frames, {
          allowLegacy: true,
        });
        signature = enrollment.signature;
      }
      setFaceSignature(signature);
      if (frames.length > 0) {
        setPhotoUri(frames[0]);
      }
      setScanHint(null);

      // Check whether this face is already registered to another staff member.
      setFaceCheckBusy(true);
      try {
        const existing = await findDuplicateFace(signature, undefined, frameEmbeddings);
        if (existing) {
          setDuplicateFaceStaff(existing.staff);
          setFaceError(
            `This face is already registered to ${existing.staff.fullName}.`,
          );
        }
      } finally {
        setFaceCheckBusy(false);
      }
    } catch (error) {
      const message =
        error instanceof FacePhotoError
          ? error.message
          : error instanceof FaceEngineUnavailableError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'A face profile could not be created from this scan.';
      setFaceError(message);
      setScanHint(null);
    } finally {
      setFaceBusy(false);
    }
  };

  const handleSave = async () => {
    if (!validateBasic()) {
      setStep(1);
      return;
    }

    if (!photoUri || !faceSignature) {
      alert({
        tone: 'warning',
        title: 'Face scan required',
        message: 'Complete the live face scan before saving.',
      });
      setStep(2);
      return;
    }

    // Block save if this face is already registered to someone else.
    if (duplicateFaceStaff) {
      alert({
        tone: 'danger',
        title: 'Face already registered',
        message: `This face matches ${duplicateFaceStaff.fullName}, who is already registered.`,
      });
      return;
    }

    setSaving(true);
    try {
      const created = createStaff({
        fullName,
        photoUri,
        faceSignature,
      });
      setRegisteredInfo({ name: created.fullName, code: created.staffCode });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not save staff member',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const stepTitle =
    step === 1 ? 'Basic info' : 'Face scan';
  const stepSubtitle =
    step === 1
      ? 'Name and biometric consent.'
      : 'A guided live scan that builds the recognition profile and profile photo.';

  const faceReady = !!faceSignature && !duplicateFaceStaff;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepHeader}>
            <View style={styles.progressRow}>
              {[1, 2].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.progressSegment,
                    n <= step && styles.progressSegmentActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.stepCount}>Step {step} of 2</Text>
            <Text style={styles.stepTitle}>{stepTitle}</Text>
            <Text style={styles.stepSubtitle}>{stepSubtitle}</Text>
          </View>

          {step === 1 ? (
            <Card style={styles.formCard}>
              <TextField
                label="Full name"
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g. Ama Mensah"
                autoCapitalize="words"
                error={errors.name}
                maxLength={80}
              />
              <View style={styles.consentBox}>
                <View style={styles.consentHeader}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={colors.infoDark}
                  />
                  <Text style={styles.consentTitle}>Biometric consent</Text>
                </View>
                <Text style={styles.consentNotice}>
                  By capturing this photo, you confirm employee consent to generate and store a local biometric facial template.
                </Text>
                <Text style={styles.consentLine}>
                  � Storage: 100% local on this device.
                </Text>
                <Text style={styles.consentLine}>
                  � Purpose: Workplace attendance verification only.
                </Text>
                <Text style={styles.consentLine}>
                  � Privacy: Biometric data is never uploaded to the cloud or shared with third parties, and can be permanently deleted by an administrator at any time.
                </Text>
              </View>
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.statusLabel}>I confirm consent</Text>
                </View>
                <Switch
                  value={consent}
                  onValueChange={setConsent}
                  trackColor={{ false: colors.slate300, true: colors.primaryLight }}
                  thumbColor={colors.white}
                />
              </View>
              <View style={styles.footerSingle}>
                <AppButton
                  title="Next"
                  onPress={() => {
                    if (!validateBasic()) return;
                    setStep(2);
                  }}
                  size="lg"
                  disabled={!fullName.trim() || !consent}
                />
              </View>
            </Card>
          ) : null}

           {step === 2 ? (
            <Card style={styles.formCard}>
              <Text style={styles.cardHint}>
                Tap{' '}
                <Text style={{ fontWeight: '800', color: colors.slate900 }}>
                  Scan face
                </Text>
                , look straight at the camera, then turn your head to one side and then the other. The face profile is
                built from the straight-on photo.
              </Text>
              <View style={styles.cameraWrap}>
                {cameraPermission?.granted ? (
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={scanCameraType}
                    pictureSize={pictureSize}
                    onCameraReady={() => void chooseSize()}
                  />
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    <Text style={styles.cardHint}>Camera permission needed.</Text>
                    <AppButton
                      title="Grant permission"
                      onPress={() => requestCameraPermission()}
                      size="sm"
                      fullWidth={false}
                    />
                  </View>
                )}
                {cameraPermission?.granted ? (
                  <Pressable
                    onPress={() =>
                      setScanCameraType((prev) =>
                        prev === ImagePicker.CameraType.back
                          ? ImagePicker.CameraType.front
                          : ImagePicker.CameraType.back,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Switch camera"
                    style={styles.cameraFlipOverlay}
                  >
                    <Ionicons
                      name="camera-reverse-outline"
                      size={20}
                      color={colors.white}
                    />
                  </Pressable>
                ) : null}
              </View>

              {faceSignature && !duplicateFaceStaff ? (
                <View style={styles.enrolledRow}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.enrolledText}>Face profile captured.</Text>
                </View>
              ) : null}
              {faceError ? <Text style={styles.photoError}>{faceError}</Text> : null}
              {duplicateFaceStaff && !faceError ? (
                <Text style={styles.photoError}>
                  This face matches {duplicateFaceStaff.fullName}, who is already registered.
                </Text>
              ) : null}

              <View style={styles.scanButtonWrap}>
                <AppButton
                  title={
                    faceBusy
                      ? 'Scanning…'
                      : faceSignature
                        ? 'Scan again'
                        : 'Scan face'
                  }
                  onPress={() => void handleFaceScan()}
                  loading={faceBusy}
                  variant={faceReady ? 'secondary' : undefined}
                  size="lg"
                  disabled={!cameraPermission?.granted || faceBusy || faceCheckBusy}
                />
              </View>



                <View style={styles.footerRow}>
                <View style={styles.footerPrimary}>
                  <AppButton
                    title="Register staff"
                    onPress={() => void handleSave()}
                    loading={saving}
                    size="lg"
                    disabled={
                      !photoUri ||
                      !faceSignature ||
                      !!duplicateFaceStaff ||
                      pinCheckBusy ||
                      faceBusy
                    }
                  />
                </View>
              </View>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {registeredInfo ? (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.recoveryOverlay}>
            <View style={styles.recoveryCard}>
              <Text style={styles.cardTitle}>Staff registered</Text>
              <Text style={styles.cardHint}>
                Give this short code to the employee.
              </Text>
              <View style={styles.recoveryCodeBox}>
                <Text style={styles.recoveryCode}>{registeredInfo.code}</Text>
              </View>
              <Text style={styles.cardHint}>
                {registeredInfo.name}
              </Text>
              <AppButton
                title="Done"
                onPress={() => {
                  setRegisteredInfo(null);
                  navigation.goBack();
                }}
                size="lg"
              />
            </View>
          </View>
        </Modal>
      ) : null}

    </Screen>
  );
}

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, STAFF_CODE_MAX_LENGTH);
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Step header + progress bar
  stepHeader: { marginBottom: spacing.lg },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
  },
  progressSegmentActive: { backgroundColor: colors.primary },
  stepCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.slate500,
  },
  stepTitle: {
    marginTop: 2,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.slate800,
  },
  stepSubtitle: { marginTop: 2, fontSize: fontSize.xs, color: colors.slate500 },

  // Custom staff code keyboard
  customKeyboard: {
    backgroundColor: colors.slate100,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customKeyboardRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  customKey: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customKeyDigit: {
    backgroundColor: colors.slate50,
  },
  customKeyPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  customKeyLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.slate900,
  },
  customKeyboardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  customKeyAction: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  customKeyDone: {
    backgroundColor: colors.primary,
  },
  customKeyActionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate900,
  },

  // Cards + text
  formCard: { marginTop: spacing.sm },
  cardHint: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },

  // Step 2 — photo
  previewColumn: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  previewCaption: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    textAlign: 'center',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photoButtonCell: { flex: 1 },

  // Step 3 — scan
  cameraWrap: {
    marginTop: spacing.md,
    height: 300,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.slate200,
  },
  cameraFlipOverlay: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: { flex: 1 },
  cameraFlipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  cameraFlipButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraFlipLabel: {
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  enrolledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  enrolledText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.successDark,
  },
  photoError: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.danger,
    textAlign: 'center',
  },
  scanButtonWrap: { marginTop: spacing.md },

  // Footer buttons (Back + primary action)
  footerSingle: { marginTop: spacing.sm },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footerBack: { flex: 1 },
  footerPrimary: { flex: 2 },

  // Notes + consent
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  noteText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  consentBox: {
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.info,
    gap: spacing.xs,
  },
  consentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  consentTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.infoDark,
  },
  consentNotice: {
    fontSize: fontSize.xs,
    color: colors.infoDark,
    lineHeight: 18,
  },
  consentLine: {
    fontSize: fontSize.xs,
    color: colors.infoDark,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleText: {
    flex: 1,
  },
  statusLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate700,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  recoveryOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  recoveryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
  },
  recoveryCodeBox: {
    marginVertical: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.slate100,
    alignItems: 'center',
  },
  recoveryCode: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.slate900,
    fontVariant: ['tabular-nums'],
  },
});
