import { useEffect, useRef, useState } from 'react';
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
} from '../../config/app';
import {
  createStaff,
  getStaffById,
  isStaffCodeTaken,
  setStaffActive,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import {
  FaceEngineUnavailableError,
  FacePhotoError,
} from '../../services/faceEngine';
import { captureChallengeFrames, LIVENESS_STEPS } from '../../services/faceLiveness';
import { createStaffFaceSignature } from '../../services/faceRecognitionService';
import {
  chooseStaffPhoto,
  captureStaffPhoto,
} from '../../services/photoService';
import { setStaffPinForStaff } from '../../services/staffPinService';
import { colors, fontSize, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterStaff'>;

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, STAFF_CODE_MAX_LENGTH);
}

/**
 * Registration is now three distinct steps:
 *  1. Basic info + fallback PIN.
 *  2. PROFILE PHOTO — a normal picture (camera or gallery) used for the
 *     staff list, reports and the confirmation modal.
 *  3. LIVE FACE SCAN — a guided multi-frame scan that builds the face
 *     profile used for recognition. This is NOT the profile photo.
 */
export function RegisterStaffScreen({ route, navigation }: Props) {
  const staffId = route.params?.staffId;
  const isEditing = typeof staffId === 'number';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [faceSignature, setFaceSignature] = useState<string | null>(null);
  const [staffPin, setStaffPin] = useState('');
  const [staffPinConfirm, setStaffPinConfirm] = useState('');

  const [faceBusy, setFaceBusy] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);

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

  // -------------------------------------------------------------------------
  // Step 2 — profile photo (a plain picture, separate from the face profile)
  // -------------------------------------------------------------------------

  const handleTakePhoto = async () => {
    try {
      const uri = await captureStaffPhoto();
      if (uri) setPhotoUri(uri);
    } catch (error) {
      Alert.alert(
        'Could not take photo',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const handleChoosePhoto = async () => {
    try {
      const uri = await chooseStaffPhoto();
      if (uri) setPhotoUri(uri);
    } catch (error) {
      Alert.alert(
        'Could not choose photo',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  // -------------------------------------------------------------------------
  // Step 3 — live face scan (multi-frame guided capture builds the profile)
  // -------------------------------------------------------------------------

  const handleFaceScan = async () => {
    if (!cameraRef.current || faceBusy) return;
    setFaceBusy(true);
    setFaceError(null);
    try {
      const shutter = () =>
        cameraRef.current!.takePictureAsync({
          quality: 0.9,
          base64: false,
          skipProcessing: false,
        });
      const frames = await captureChallengeFrames(
        shutter,
        LIVENESS_STEPS,
        (index) => setScanHint(LIVENESS_STEPS[index]?.hint ?? null),
      );
      setScanHint('Building face profile…');
      const enrollment = await createStaffFaceSignature(frames, {
        allowLegacy: true,
      });
      setFaceSignature(enrollment.signature);
      setScanHint(null);
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

    if (!photoUri) {
      Alert.alert('Profile photo required', 'Add a profile photo before saving.');
      setStep(2);
      return;
    }

    if (!faceSignature) {
      Alert.alert(
        'Face scan required',
        'Complete the live face scan before saving.',
      );
      setStep(3);
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

  const stepTitle =
    step === 1
      ? 'Step 1: Basic info'
      : step === 2
        ? 'Step 2: Profile photo'
        : 'Step 3: Face scan';
  const stepSubtitle =
    step === 1
      ? 'Name and fallback PIN.'
      : step === 2
        ? 'A normal photo for the staff list and reports.'
        : 'A guided live scan that builds the recognition profile.';

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
              <Text style={styles.cardTitle}>Profile photo</Text>
              <Text style={styles.cardHint}>
                This picture appears on the staff list, reports and the match
                confirmation. A clear head-and-shoulders photo works best.
              </Text>
              {photoUri ? (
                <View style={styles.previewRow}>
                  <Avatar
                    name={fullName || 'New staff'}
                    photoUri={photoUri}
                    size={72}
                  />
                  <Text style={styles.cardHint}>Photo set.</Text>
                </View>
              ) : (
                <View style={styles.previewRow}>
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons
                      name="person-outline"
                      size={28}
                      color={colors.slate400}
                    />
                  </View>
                  <Text style={styles.cardHint}>No photo yet.</Text>
                </View>
              )}
              <View style={styles.photoButtons}>
                <AppButton
                  title="Take photo"
                  onPress={() => void handleTakePhoto()}
                  size="sm"
                  fullWidth={false}
                  icon={
                    <Ionicons name="camera-outline" size={18} color={colors.white} />
                  }
                />
                <AppButton
                  title="Choose from library"
                  onPress={() => void handleChoosePhoto()}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                />
              </View>
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
                  onPress={() => {
                    if (!photoUri) {
                      Alert.alert(
                        'Photo required',
                        'Add a profile photo (take one or pick from the library).',
                      );
                      return;
                    }
                    setStep(3);
                  }}
                  size="sm"
                  fullWidth={false}
                  disabled={!photoUri}
                />
              </View>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card style={styles.formCard}>
              <Text style={styles.cardTitle}>Live face scan</Text>
              <Text style={styles.cardHint}>
                {scanHint ??
                  'Tap “Scan face” and follow the prompts. Three frames are captured and combined into the face profile.'}
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

              {faceSignature ? (
                <View style={styles.enrolledRow}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.enrolledText}>Face profile captured.</Text>
                </View>
              ) : null}
              {faceError ? <Text style={styles.photoError}>{faceError}</Text> : null}

              <AppButton
                title={faceBusy ? 'Scanning…' : 'Scan face'}
                onPress={() => void handleFaceScan()}
                loading={faceBusy}
                size="lg"
                disabled={!cameraPermission?.granted || faceBusy}
              />
              <Text style={styles.cardHint}>
                The profile photo and the face profile are separate: the photo is
                for display, the scan is what the kiosk matches against.
              </Text>

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
                  onPress={() => void handleSave()}
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
            <Ionicons name="scan-outline" size={16} color={colors.slate500} />
            <Text style={styles.noteText}>
              Face matching runs entirely on this device. A clear, front-facing
              profile photo plus a guided scan with head movement gives the most
              reliable match. The staff code is generated automatically and
              shown on the staff list.
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
  stepTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.slate800,
  },
  stepSubtitle: { marginTop: 2, fontSize: fontSize.xs, color: colors.slate500 },
  formCard: { marginTop: spacing.sm },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  cardHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  statusCard: { marginTop: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusText: { flex: 1 },
  statusTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  statusHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  cameraWrap: {
    marginTop: spacing.md,
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.slate200,
  },
  camera: { flex: 1 },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  enrolledRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  stepNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  noteText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
  },
});
