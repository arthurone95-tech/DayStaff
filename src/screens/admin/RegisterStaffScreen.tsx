import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import {
  STAFF_CODE_MAX_LENGTH,
  STAFF_CODE_MIN_LENGTH,
  STAFF_CODE_PATTERN,
} from '../../config/app';
import {
  createStaff,
  getStaffById,
  isStaffCodeTaken,
  setStaffActive,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import { getBiometricLabelSync, getBiometricStatus } from '../../services/biometricService';
import {
  FaceEngineUnavailableError,
  FacePhotoError,
} from '../../services/faceEngine';
import {
  createStaffFaceSignature,
} from '../../services/faceRecognitionService';
import { colors, fontSize, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterStaff'>;

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, STAFF_CODE_MAX_LENGTH);
}

const FINGERPRINT_STEPS = [
  'Place your finger on the scanner.',
  'Lift and press again.',
  'Shift slightly left and press.',
  'Tilt right and press.',
  'Lift and press one final time.',
];

const FACE_GUIDANCE = [
  'Look straight ahead.',
  'Turn your head slightly left.',
  'Turn your head slightly right.',
  'Tilt up, then down.',
  'Hold steady…',
];

export function RegisterStaffScreen({ route, navigation }: Props) {
  const staffId = route.params?.staffId;
  const isEditing = typeof staffId === 'number';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});

  const [fingerprintStep, setFingerprintStep] = useState(0);
  const [fingerprintDone, setFingerprintDone] = useState(false);
  const [fingerprintSignature, setFingerprintSignature] = useState<string | null>(
    null,
  );

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [faceSignature, setFaceSignature] = useState<string | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [faceGuidanceIndex, setFaceGuidanceIndex] = useState(0);

  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit staff' : 'Register staff',
    });

    if (isEditing && staffId) {
      const existing = getStaffById(staffId);
      if (existing) {
        setFullName(existing.fullName);
        setStaffCode(existing.staffCode);
        setPhotoUri(existing.photoUri);
        setFaceSignature(existing.faceSignature);
        setFingerprintSignature(existing.fingerprintSignature);
        setIsActive(existing.isActive === 1);
        if (existing.fingerprintSignature) {
          setFingerprintDone(true);
        }
        if (existing.faceSignature) {
          // Skip to review-ish: start at step 1 but allow re-enrollment.
        }
      }
      setLoading(false);
    }
  }, [isEditing, staffId, navigation]);

  const validateBasic = (): boolean => {
    const next: { name?: string; code?: string } = {};
    if (!fullName.trim()) {
      next.name = 'Full name is required.';
    }
    const normalizedCode = normalizeCode(staffCode);
    if (!normalizedCode) {
      next.code = 'A kiosk staff code is required.';
    } else if (
      !STAFF_CODE_PATTERN.test(normalizedCode) ||
      normalizedCode.length < STAFF_CODE_MIN_LENGTH ||
      normalizedCode.length > STAFF_CODE_MAX_LENGTH
    ) {
      next.code = `Use ${STAFF_CODE_MIN_LENGTH}–${STAFF_CODE_MAX_LENGTH} letters or numbers.`;
    } else if (isStaffCodeTaken(normalizedCode, staffId)) {
      next.code = 'That code is already assigned to another staff member.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFingerprintTap = () => {
    if (fingerprintDone) return;
    const next = fingerprintStep + 1;
    if (next >= FINGERPRINT_STEPS.length) {
      setFingerprintDone(true);
      setFingerprintSignature(`fp:${Date.now()}`);
    } else {
      setFingerprintStep(next);
    }
  };

  const handleFaceCapture = async () => {
    if (!cameraRef.current || faceBusy) return;
    setFaceBusy(true);
    setFaceError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setFaceError('The camera did not return a photo. Try again.');
        return;
      }
      try {
        const enrollment = await createStaffFaceSignature(photo.uri, {
          allowLegacy: __DEV__,
        });
        setPhotoUri(photo.uri);
        setFaceSignature(enrollment.signature);
      } catch (error) {
        const message =
          error instanceof FacePhotoError
            ? error.message
            : error instanceof FaceEngineUnavailableError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'A face profile could not be created from this photo.';
        setFaceError(message);
      }
    } catch (error) {
      setFaceError(
        error instanceof Error ? error.message : 'Could not capture a photo.',
      );
    } finally {
      setFaceBusy(false);
    }
  };

  // Cycle guidance text while on face step.
  useEffect(() => {
    if (step !== 3) return;
    const interval = setInterval(() => {
      setFaceGuidanceIndex((i) => (i + 1) % FACE_GUIDANCE.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [step]);

  const handleSave = async () => {
    if (!validateBasic()) {
      setStep(1);
      return;
    }
    if (!fingerprintDone) {
      Alert.alert(
        'Fingerprint required',
        'Complete the fingerprint enrollment before saving.',
      );
      setStep(2);
      return;
    }
    if (!photoUri || !faceSignature) {
      Alert.alert(
        'Face scan required',
        'Complete the face scan before saving.',
      );
      setStep(3);
      return;
    }

    setSaving(true);
    try {
      const normalizedCode = normalizeCode(staffCode);
      if (isEditing && staffId) {
        updateStaff(staffId, {
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature,
          fingerprintSignature,
        });
      } else {
        createStaff({
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature,
          fingerprintSignature,
        });
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not save staff member',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = () => {
    if (!staffId) return;
    const nextActive = !isActive;
    Alert.alert(
      nextActive ? 'Reactivate staff member?' : 'Deactivate staff member?',
      nextActive
        ? 'They will appear on the kiosk again.'
        : 'They will be hidden from the kiosk. Existing attendance records are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextActive ? 'Reactivate' : 'Deactivate',
          style: nextActive ? 'default' : 'destructive',
          onPress: () => {
            setStaffActive(staffId, nextActive);
            setIsActive(nextActive);
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>
              {step === 1
                ? 'Step 1: Basic info'
                : step === 2
                  ? 'Step 2: Fingerprint'
                  : 'Step 3: Face scan'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {step === 1
                ? 'Name and staff code.'
                : step === 2
                  ? 'Enroll a fingerprint.'
                  : 'Scan the face and capture a photo.'}
            </Text>
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
              <TextField
                label="Staff ID / code"
                value={staffCode}
                onChangeText={(value) => {
                  setStaffCode(normalizeCode(value));
                  setErrors((prev) => ({ ...prev, code: undefined }));
                }}
                placeholder="e.g. G2"
                autoCapitalize="characters"
                error={errors.code}
                hint={`${STAFF_CODE_MIN_LENGTH}–${STAFF_CODE_MAX_LENGTH} letters or numbers.`}
                maxLength={STAFF_CODE_MAX_LENGTH}
              />
              <AppButton
                title="Next"
                onPress={() => {
                  if (validateBasic()) setStep(2);
                }}
                size="lg"
              />
            </Card>
          ) : null}

          {step === 2 ? (
            <Card style={styles.formCard}>
              <Text style={styles.cardTitle}>Fingerprint enrollment</Text>
              <Text style={styles.cardHint}>
                Tap the scanner below, following the prompts, to enroll a
                fingerprint.
              </Text>
              <Pressable
                onPress={handleFingerprintTap}
                style={({ pressed }) => [
                  styles.fingerScanner,
                  pressed && styles.fingerScannerPressed,
                  fingerprintDone && styles.fingerScannerDone,
                ]}
              >
                <Ionicons
                  name={fingerprintDone ? 'checkmark-circle' : 'finger-print'}
                  size={64}
                  color={fingerprintDone ? colors.success : colors.primary}
                />
                <Text style={styles.fingerScannerText}>
                  {fingerprintDone
                    ? 'Enrolled'
                    : FINGERPRINT_STEPS[fingerprintStep]}
                </Text>
              </Pressable>
              <View style={styles.stepNav}>
                <AppButton
                  title="Back"
                  onPress={() => setStep(1)}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                />
                <AppButton
                  title="Next"
                  onPress={() => setStep(3)}
                  size="sm"
                  fullWidth={false}
                  disabled={!fingerprintDone}
                />
              </View>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card style={styles.formCard}>
              <Text style={styles.cardTitle}>Face scan</Text>
              <Text style={styles.cardHint}>
                {FACE_GUIDANCE[faceGuidanceIndex]}
              </Text>
              <View style={styles.cameraWrap}>
                {cameraPermission?.granted ? (
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="front"
                  />
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    <Text style={styles.cardHint}>Camera permission needed.</Text>
                    <AppButton
                      title="Grant permission"
                      onPress={() => requestCameraPermission()}
                      size="sm"
                    />
                  </View>
                )}
              </View>
              {photoUri ? (
                <View style={styles.previewRow}>
                  <Avatar name={fullName || 'New staff'} photoUri={photoUri} size={64} />
                  <Text style={styles.cardHint}>Photo captured.</Text>
                </View>
              ) : null}
              {faceError ? (
                <Text style={styles.photoError}>{faceError}</Text>
              ) : null}
              <AppButton
                title={faceBusy ? 'Scanning…' : 'Capture face'}
                onPress={handleFaceCapture}
                loading={faceBusy}
                size="lg"
                disabled={!cameraPermission?.granted}
              />
              <View style={styles.stepNav}>
                <AppButton
                  title="Back"
                  onPress={() => setStep(2)}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                />
                <AppButton
                  title={isEditing ? 'Save changes' : 'Register staff member'}
                  onPress={handleSave}
                  loading={saving}
                  size="sm"
                  fullWidth={false}
                  disabled={!photoUri || !faceSignature}
                />
              </View>
            </Card>
          ) : null}

          {isEditing ? (
            <Card style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={styles.statusText}>
                  <Text style={styles.statusTitle}>
                    {isActive ? 'Active staff member' : 'Deactivated'}
                  </Text>
                  <Text style={styles.statusHint}>
                    {isActive
                      ? 'Visible on the kiosk and included in reports.'
                      : 'Hidden from the kiosk. Attendance history is preserved.'}
                  </Text>
                </View>
                <AppButton
                  title={isActive ? 'Deactivate' : 'Reactivate'}
                  onPress={toggleActive}
                  variant={isActive ? 'danger' : 'success'}
                  size="sm"
                  fullWidth={false}
                />
              </View>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepHeader: { marginBottom: spacing.lg },
  stepTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.slate800 },
  stepSubtitle: { marginTop: 2, fontSize: fontSize.xs, color: colors.slate500 },
  formCard: { marginTop: spacing.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.slate800 },
  cardHint: { marginTop: spacing.xs, fontSize: fontSize.xs, color: colors.slate500, lineHeight: 18 },
  statusCard: { marginTop: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusText: { flex: 1 },
  statusTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.slate800 },
  statusHint: { marginTop: 2, fontSize: fontSize.xs, color: colors.slate500, lineHeight: 18 },
  fingerScanner: {
    marginTop: spacing.lg,
    height: 180,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  fingerScannerPressed: { opacity: 0.7 },
  fingerScannerDone: { borderColor: colors.success, backgroundColor: colors.successSoft ?? colors.white },
  fingerScannerText: { fontSize: fontSize.sm, color: colors.slate500, textAlign: 'center', paddingHorizontal: spacing.md },
  cameraWrap: { marginTop: spacing.md, height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.slate200 },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  photoError: { marginTop: spacing.sm, fontSize: fontSize.xs, color: colors.danger, textAlign: 'center' },
  stepNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },
});
