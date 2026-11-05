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
import { createFaceSignature } from '../../services/faceSignature';
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

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const uri =
        source === 'camera'
          ? await captureStaffPhoto()
          : await chooseStaffPhoto();
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (error) {
      Alert.alert(
        'Photo unavailable',
        error instanceof Error ? error.message : 'Could not access the photo.',
      );
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    setSaving(true);
    try {
      const normalizedCode = normalizeCode(staffCode);
      let nextSignature = faceSignature;

      if (!photoUri) {
        nextSignature = null;
      } else if (photoUri !== initialPhoto || !nextSignature) {
        try {
          nextSignature = await createFaceSignature(photoUri);
        } catch {
          nextSignature = null;
        }
      }

      if (isEditing && staffId) {
        updateStaff(staffId, {
          fullName,
          staffCode: normalizedCode,
          photoUri,
          faceSignature: nextSignature,
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
          <Avatar
            name={fullName || 'New staff'}
            photoUri={photoUri}
            size={110}
            ringColor={colors.slate200}
          />
          <View style={styles.photoActions}>
            <AppButton
              title="Camera"
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
              title="Library"
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
            {photoUri ? (
              <AppButton
                title="Remove"
                onPress={() => setPhotoUri(null)}
                variant="ghost"
                size="sm"
                fullWidth={false}
              />
            ) : null}
          </View>
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
            Code mode verifies the fingerprint or Face ID enrolled on this
            terminal. Face mode uses this profile photo for an on-device visual
            match, so use a clear, front-facing portrait when possible.
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
