import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
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
  createStaff,
  getStaffById,
  setStaffActive,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import {
  captureStaffPhoto,
  chooseStaffPhoto,
  deleteStaffPhoto,
} from '../../services/photoService';
import { colors, fontSize, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterStaff'>;

const PHONE_PATTERN = /^[+()\d\s-]{6,20}$/;

export function RegisterStaffScreen({ route, navigation }: Props) {
  const staffId = route.params?.staffId;
  const isEditing = typeof staffId === 'number';

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [initialPhoto, setInitialPhoto] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
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
        setPhoneNumber(existing.phoneNumber);
        setPhotoUri(existing.photoUri);
        setInitialPhoto(existing.photoUri);
        setIsActive(existing.isActive === 1);
      }
      setLoading(false);
    }
  }, [isEditing, staffId, navigation]);

  const validate = (): boolean => {
    const next: { name?: string; phone?: string } = {};
    if (!fullName.trim()) {
      next.name = 'Full name is required.';
    }
    if (phoneNumber.trim() && !PHONE_PATTERN.test(phoneNumber.trim())) {
      next.phone = 'Enter a valid phone number (6–20 digits).';
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

  const handleSave = () => {
    if (!validate()) {
      return;
    }
    setSaving(true);
    try {
      if (isEditing && staffId) {
        updateStaff(staffId, {
          fullName,
          phoneNumber,
          photoUri,
        });
        if (initialPhoto && initialPhoto !== photoUri) {
          void deleteStaffPhoto(initialPhoto);
        }
      } else {
        createStaff({ fullName, phoneNumber, photoUri });
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
            label="Phone number"
            value={phoneNumber}
            onChangeText={(value) => {
              setPhoneNumber(value);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            placeholder="e.g. 024 123 4567"
            keyboardType="phone-pad"
            autoCapitalize="none"
            error={errors.phone}
            hint="Optional, but useful for admin contact."
            maxLength={20}
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
            The kiosk verifies the device's enrolled fingerprint or Face ID,
            then records attendance against the selected staff profile. Make
            sure biometrics are set up on this terminal device.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
