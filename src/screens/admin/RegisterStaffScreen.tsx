import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { getBiometricLabelSync } from '../../services/biometricService';
import {
  FaceEngineUnavailableError,
  FacePhotoError,
} from '../../services/faceEngine';
import { createStaffFaceSignature } from '../../services/faceRecognitionService';
import { setStaffPinForStaff } from '../../services/staffPinService';
import { persistPhoto } from '../../services/photoService';
import { colors, fontSize, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterStaff'>;

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, STAFF_CODE_MAX_LENGTH);
}

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

  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [faceSignature, setFaceSignature] = useState<string | null>(null);
  const [staffPin, setStaffPin] = useState('');
  const [staffPinConfirm, setStaffPinConfirm] = useState('');
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
        setIsActive(existing.isActive === 1);
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
    if (normalizedCode && isStaffCodeTaken(normalizedCode, staffId)) {
      next.code = 'That code is already assigned to another staff member.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
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
        const persisted = await persistPhoto(photo.uri);
        const enrollment = await createStaffFaceSignature(persisted, {
          allowLegacy: true,
        });
        setPhotoUri(persisted);
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
    if (step !== 2) return;
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

    // PIN validation.
    if (!isEditing) {
      if (!/^\d{6}$/.test(staffPin)) {
        Alert.alert('PIN required', 'Enter a 6-digit fallback PIN.');
        return;
      }
      if (staffPin !== staffPinConfirm) {
        Alert.alert('PIN mismatch', 'The PIN and confirmation do not match.');
        return;
      }
    } else if (staffPin || staffPinConfirm) {
      if (!/^\d{6}$/.test(staffPin)) {
        Alert.alert('Invalid PIN', 'PIN must be exactly 6 digits.');
        return;
      }
      if (staffPin !== staffPinConfirm) {
        Alert.alert('PIN mismatch', 'The PIN and confirmation do not match.');
        return;
      }
    }

    if (!photoUri || !faceSignature) {
      Alert.alert(
        'Face scan required',
        'Complete the face scan before saving.',
      );
      setStep(2);
      return;
    }

    setSaving(true);
    try {
      const normalizedCode = normalizeCode(staffCode);
      let savedId: number | null = null;
      if (isEditing && staffId) {
        const existingCode = getStaffById(staffId)?.staffCode ?? '';
        updateStaff(staffId, {
          fullName,
          staffCode: normalizedCode || existingCode,
          photoUri,
          faceSignature,
        });
        savedId = staffId;
      } else {
        const created = createStaff({
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature,
        });
        savedId = created.id;
      }
      if (savedId && staffPin) {
        await setStaffPinForStaff(savedId, staffPin);
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
              {step === 1 ? 'Step 1: Basic info' : 'Step 2: Face scan'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {step === 1
                ? 'Name and fallback PIN.'
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
                label="Fallback PIN (6 digits)"
                value={staffPin}
                onChangeText={setStaffPin}
                placeholder="e.g. 123456"
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
                hint="Used only when face recognition is ambiguous."
              />
              <TextField
                label="Confirm PIN"
                value={staffPinConfirm}
                onChangeText={setStaffPinConfirm}
                placeholder="e.g. 123456"
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
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
                  onPress={() => setStep(1)}
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

          <View style={styles.note}>
            <Ionicons
              name="scan-outline"
              size={16}
              color={colors.slate500}
            />
            <Text style={styles.noteText}>
              Face mode builds an on-device face profile from this scan; a
              clear, front-facing capture gives the most reliable match. The
              staff code is generated automatically and shown on the staff list.
            </Text>
          </View>
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
  cameraWrap: { marginTop: spacing.md, height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.slate200 },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  photoError: { marginTop: spacing.sm, fontSize: fontSize.xs, color: colors.danger, textAlign: 'center' },
  stepNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  noteText: { flex: 1, fontSize: fontSize.xs, color: colors.slate500, lineHeight: 18 },
});
