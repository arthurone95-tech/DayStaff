import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
  isFaceEmbeddingSignature,
} from '../../services/faceEngine';
import { createStaffFaceSignature } from '../../services/faceRecognitionService';
import {
  captureStaffPhoto,
  chooseStaffPhoto,
  deleteStaffPhoto,
} from '../../services/photoService';
import { colors, fontSize, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterStaff'>;

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, STAFF_CODE_MAX_LENGTH);
}

export function RegisterStaffScreen({ route, navigation }: Props) {
  const staffId = route.params?.staffId;
  const isEditing = typeof staffId === 'number';

  const [fullName, setFullName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [initialPhoto, setInitialPhoto] = useState<string | null>(null);
  const [faceSignature, setFaceSignature] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{
    name?: string;
    code?: string;
    photo?: string;
  }>({});
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

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
        setInitialPhoto(existing.photoUri);
        setFaceSignature(existing.faceSignature);
        setIsActive(existing.isActive === 1);
      }
      setLoading(false);
    }
  }, [isEditing, staffId, navigation]);

  const validate = (): boolean => {
    const next: { name?: string; code?: string; photo?: string } = {};
    if (!fullName.trim()) {
      next.name = 'Full name is required.';
    }

    if (!photoUri) {
      next.photo =
        'A clear profile photo is required before this staff member can be saved.';
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

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const uri =
        source === 'camera'
          ? await captureStaffPhoto()
          : await chooseStaffPhoto();
      if (uri) {
        setPhotoUri(uri);
        setFaceSignature(null);
        setErrors((prev) => ({ ...prev, photo: undefined }));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not access the photo.';
      setErrors((prev) => ({ ...prev, photo: message }));
      Alert.alert('Photo unavailable', message);
    }
  };

  const handleSave = async () => {
    if (!validate() || !photoUri) {
      return;
    }
    setSaving(true);
    try {
      const normalizedCode = normalizeCode(staffCode);
      let nextSignature = faceSignature;

      if (
        photoUri !== initialPhoto ||
        !isFaceEmbeddingSignature(nextSignature)
      ) {
        try {
          const enrollment = await createStaffFaceSignature(photoUri, {
            // Expo Go cannot load the native face engine. Keep development
            // usable with the legacy matcher, but production builds must use
            // the real embedding model.
            allowLegacy: __DEV__,
          });
          nextSignature = enrollment.signature;
        } catch (error) {
          const message =
            error instanceof FacePhotoError
              ? error.message
              : error instanceof FaceEngineUnavailableError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'A face profile could not be created from this photo.';
          setErrors((prev) => ({ ...prev, photo: message }));
          Alert.alert('Photo cannot be used', message);
          return;
        }
      }

      if (isEditing && staffId) {
        updateStaff(staffId, {
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature: nextSignature,
          fingerprintSignature: staffId
            ? getStaffById(staffId)?.fingerprintSignature ?? null
            : null,
        });
        if (initialPhoto && initialPhoto !== photoUri) {
          void deleteStaffPhoto(initialPhoto);
        }
      } else {
        createStaff({
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature: nextSignature,
          fingerprintSignature: null,
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
    if (!staffId) {
      return;
    }
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
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
        <Card style={styles.photoCard}>
          <View style={styles.photoHeading}>
            <Text style={styles.photoTitle}>Profile photo</Text>
            <View style={styles.requiredPill}>
              <Text style={styles.requiredLabel}>Required</Text>
            </View>
          </View>
          <Avatar
            name={fullName || 'New staff'}
            photoUri={photoUri}
            size={110}
            ringColor={errors.photo ? colors.danger : colors.slate200}
          />
          <Text style={styles.photoHint}>
            Passport-style photo: face and shoulders, looking straight ahead,
            even lighting, no hat or sunglasses. This photo is also used for
            face recognition.
          </Text>
          <View style={styles.photoActions}>
            <AppButton
              title={photoUri ? 'Retake' : 'Camera'}
              onPress={() => pickPhoto('camera')}
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon={
                <Ionicons
                  name="camera-outline"
                  size={16}
                  color={colors.infoDark}
                />
              }
            />
            <AppButton
              title={photoUri ? 'Replace' : 'Library'}
              onPress={() => pickPhoto('library')}
              variant="ghost"
              size="sm"
              fullWidth={false}
              icon={
                <Ionicons
                  name="images-outline"
                  size={16}
                  color={colors.primary}
                />
              }
            />
          </View>
          {errors.photo ? (
            <Text style={styles.photoError}>{errors.photo}</Text>
          ) : null}
        </Card>

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
            hint={`${STAFF_CODE_MIN_LENGTH}–${STAFF_CODE_MAX_LENGTH} letters or numbers. Staff type this on the kiosk keypad, so it must be unique.`}
            maxLength={STAFF_CODE_MAX_LENGTH}
          />

          <AppButton
            title={isEditing ? 'Save changes' : 'Register staff member'}
            onPress={handleSave}
            loading={saving}
            size="lg"
          />
        </Card>

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
            name="finger-print-outline"
            size={16}
            color={colors.slate500}
          />
          <Text style={styles.noteText}>
            Code mode verifies the {getBiometricLabelSync()} enrolled on this
            terminal. Face mode builds an on-device face profile from this photo;
            a clear, front-facing portrait gives the most reliable match.
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCard: {
    alignItems: 'center',
  },
  photoHeading: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  photoTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate800,
  },
  requiredPill: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  requiredLabel: {
    color: colors.dangerDark,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  photoHint: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.slate500,
    lineHeight: 18,
    textAlign: 'center',
  },
  photoError: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.danger,
    lineHeight: 18,
    textAlign: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  formCard: {
    marginTop: spacing.lg,
  },
  statusCard: {
    marginTop: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusText: {
    flex: 1,
  },
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
