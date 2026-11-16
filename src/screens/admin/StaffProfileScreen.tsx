import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useLayoutEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAppDialog } from '../../components/AppDialog';
import {
  clearStaffDeviceCredential,
  deleteStaffProfile,
  getStaffById,
  setStaffActive,
  setStaffPin,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import type { Staff } from '../../types';
import { PhonePairingModal } from '../../components/PhonePairingModal';
import { STAFF_CODE_MAX_LENGTH } from '../../config/app';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffProfile'>;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ---------- Small building blocks ---------- */

function InfoRow({
  icon,
  label,
  children,
  last,
  compact,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
  last?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        compact && styles.rowCompact,
        !last && styles.rowDivider,
      ]}
    >
      <View style={[styles.rowIconWrap, styles.rowIconWrapPrimary]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>{children}</View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  last,
  compact,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
  compact?: boolean;
}) {
  const tint = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionRow,
        compact && styles.rowCompact,
        !last && styles.rowDivider,
        pressed && styles.actionRowPressed,
      ]}
    >
      <View
        style={[
          styles.rowIconWrap,
          danger ? styles.rowIconWrapDanger : styles.rowIconWrapPrimary,
        ]}
      >
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionTitle, danger && { color: colors.danger }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.actionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.slate500} />
    </Pressable>
  );
}

/* ---------- Screen ---------- */

export function StaffProfileScreen({ navigation, route }: Props) {
  const staffId = route.params?.staffId;
  const { alert, confirm } = useAppDialog();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [fullName, setFullName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [photoUri, setPhotoUri] = useState<Staff['photoUri'] | undefined>(undefined);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  // Fallback PIN sheet
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [pairingOpen, setPairingOpen] = useState(false);

  // Hide the header back button (and swipe-back) while editing
  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: !editing,
      headerLeft: editing ? () => null : undefined,
      gestureEnabled: !editing,
    });
  }, [navigation, editing]);

  useFocusEffect(
    useCallback(() => {
      if (staffId) {
        loadStaff(staffId);
      }
    }, [staffId]),
  );

  const loadStaff = (id: number) => {
    const member = getStaffById(id);
    if (member) {
      setStaff(member);
      setFullName(member.fullName);
      setStaffCode(member.staffCode);
      setIsActive(member.isActive === 1);
      setPhotoUri(member.photoUri);
    }
    setLoading(false);
  };

  const handleSave = () => {
    if (!staff || !staffId) return;

    if (!fullName.trim()) {
      alert({
        tone: 'warning',
        title: 'Name required',
        message: 'Please enter a staff name.',
      });
      return;
    }

    confirm({
      tone: 'success',
      icon: 'checkmark-circle',
      title: 'Save changes?',
      message: 'This will save the updated staff details. Continue?',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setSaving(true);
        try {
          const normalizedCode = staffCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (
            normalizedCode &&
            normalizedCode.length !== STAFF_CODE_MAX_LENGTH
          ) {
            alert({
              tone: 'warning',
              title: 'Invalid staff code',
              message: `Use exactly ${STAFF_CODE_MAX_LENGTH} letters or numbers, or clear the field to generate a new one.`,
            });
            setSaving(false);
            return;
          }
          updateStaff(staffId, {
            fullName: fullName.trim(),
            staffCode: normalizedCode || undefined,
            photoUri: photoUri ?? null,
            faceSignature: staff.faceSignature,
          });
          setStaff(getStaffById(staffId) ?? null);
          setEditing(false);
          alert({
            tone: 'success',
            title: 'Staff updated',
            message: `${fullName.trim()}'s details have been saved.`,
          });
        } catch (error) {
          alert({
            tone: 'danger',
            title: 'Could not save staff member',
            message: error instanceof Error ? error.message : 'Please try again.',
          });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const openPinSheet = () => {
    setPin('');
    setPinConfirm('');
    setPinError('');
    setPinSheetOpen(true);
  };

  const closePinSheet = () => {
    setPinSheetOpen(false);
    setPin('');
    setPinConfirm('');
    setPinError('');
  };

  const handleSavePin = async () => {
    if (!staffId || !staff) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setPinError('PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== pinConfirm) {
      setPinError('The two PINs do not match.');
      return;
    }
    try {
      await setStaffPin(staffId, pin);
      loadStaff(staffId);
      closePinSheet();
      alert({
        tone: 'success',
        title: 'Fallback PIN saved',
        message: `${staff.fullName}’s fallback PIN has been set.`,
      });
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not save PIN.');
    }
  };

  const handleUnpairPhone = () => {
    if (!staffId || !staff) return;
    confirm({
      tone: 'danger',
      icon: 'phone-portrait-outline',
      title: 'Unpair this phone?',
      message: `${staff.fullName} will not be able to use short code + QR until a phone is paired again. Past attendance records are kept.`,
      confirmLabel: 'Unpair',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => {
        clearStaffDeviceCredential(staffId);
        loadStaff(staffId);
      },
    });
  };

  const handleToggleActive = () => {
    if (!staffId || !staff) return;
    const nextActive = !isActive;
    confirm({
      tone: nextActive ? 'question' : 'danger',
      icon: nextActive ? 'person-add-outline' : 'person-remove-outline',
      title: nextActive ? 'Reactivate staff member?' : 'Deactivate staff member?',
      message: nextActive
        ? 'They will appear on the kiosk again.'
        : 'They will be hidden from the kiosk. Existing attendance records are kept.',
      confirmLabel: nextActive ? 'Reactivate' : 'Deactivate',
      cancelLabel: 'Cancel',
      destructive: !nextActive,
      onConfirm: () => {
        setStaffActive(staffId, nextActive);
        setIsActive(nextActive);
        loadStaff(staffId);
      },
    });
  };

  const handleDeleteStaff = () => {
    if (!staffId || !staff) return;
    confirm({
      tone: 'danger',
      icon: 'trash-outline',
      title: `Delete staff profile?`,
      message: `Are you sure you want to permanently delete ${staff.fullName}? This removes all facial data and photos, but keeps past clock-in records as archived history.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteStaffProfile(staffId);
          alert({
            tone: 'success',
            title: 'Staff profile deleted',
            message: `${staff.fullName} has been deleted. Facial data and photos were removed; past clock-in records are kept as archived history.`,
          });
          navigation.goBack();
        } catch (error) {
          alert({
            tone: 'danger',
            title: 'Could not delete staff profile',
            message: error instanceof Error ? error.message : 'Please try again.',
          });
        }
      },
    });
  };

  const handleTakePhoto = async () => {
    setPhotoSheetOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert({
        tone: 'warning',
        title: 'Camera access needed',
        message: 'Allow camera access in your device settings to take a photo.',
      });
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not open camera',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handlePickFromLibrary = async () => {
    setPhotoSheetOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert({
        tone: 'warning',
        title: 'Photo access needed',
        message: 'Allow photo library access in your device settings to choose a picture.',
      });
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not open library',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleCancelEdit = () => {
    if (!staffId) return;
    loadStaff(staffId);
    setEditing(false);
  };

  const hasChanges =
    fullName.trim() !== (staff?.fullName ?? '').trim() ||
    staffCode.toUpperCase() !== (staff?.staffCode ?? '').toUpperCase() ||
    isActive !== (staff?.isActive === 1) ||
    photoUri !== staff?.photoUri;

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!staff) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle"
          title="Staff member not found"
          message="This staff member could not be loaded."
          actionLabel="Back to staff list"
          onAction={() => navigation.goBack()}
        />
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
          alwaysBounceVertical={false}
        >
          {!editing ? (
            <>
              {/* ===== VIEW MODE: COMPACT PROFILE HEADER ===== */}
              <View style={styles.profileCard}>
                <Pressable
                  onPress={() => {
                    if (staff.photoUri) setPhotoViewerOpen(true);
                  }}
                  disabled={!staff.photoUri}
                  style={styles.avatarPressable}
                >
                  <Avatar
                    name={staff.fullName}
                    photoUri={staff.photoUri}
                    size={72}
                  />
                </Pressable>
                <View style={styles.profileCardText}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {staff.fullName}
                  </Text>
                  <View style={styles.heroMetaRow}>
                    <Badge
                      label={isActive ? 'Active' : 'Inactive'}
                      tone={isActive ? 'success' : 'neutral'}
                    />
                    <View style={styles.codeChip}>
                      <Text style={styles.codeChipText}>
                        {staff.staffCode ? `#${staff.staffCode}` : 'No staff code'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ===== VIEW MODE: DETAILS ===== */}
              <Text style={[styles.sectionTitle, styles.sectionTitleTight]}>
                Details
              </Text>
              <View style={styles.card}>
                <InfoRow icon="scan-outline" label="Face profile" compact>
                  <Badge
                    label={staff.faceSignature ? 'Enrolled' : 'Not enrolled'}
                    tone={staff.faceSignature ? 'success' : 'neutral'}
                  />
                </InfoRow>
                <InfoRow icon="key-outline" label="Fallback PIN" compact>
                  <Badge
                    label={staff.staffPinHash ? 'Set' : 'Not set'}
                    tone={staff.staffPinHash ? 'success' : 'neutral'}
                  />
                </InfoRow>
                <InfoRow
                  icon="phone-portrait-outline"
                  label="Paired phone"
                  last
                  compact
                >
                  <Badge
                    label={staff.deviceToken ? 'Paired' : 'Not paired'}
                    tone={staff.deviceToken ? 'success' : 'neutral'}
                  />
                </InfoRow>
              </View>

              {/* ===== VIEW MODE: PRIMARY ACTION ===== */}
              <View style={styles.primaryAction}>
                <AppButton
                  title="Edit profile"
                  onPress={() => setEditing(true)}
                  icon={
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                  }
                />
              </View>

              {/* ===== VIEW MODE: MANAGE ACCESS ===== */}
              <Text style={[styles.sectionTitle, styles.sectionTitleTight]}>
                Manage access
              </Text>
              <View style={styles.card}>
                <ActionRow
                  compact
                  icon="key-outline"
                  title={staff.staffPinHash ? 'Change fallback PIN' : 'Add fallback PIN'}
                  onPress={openPinSheet}
                />

                <ActionRow
                  compact
                  icon={isActive ? 'person-remove-outline' : 'person-add-outline'}
                  title={
                    isActive ? 'Deactivate staff member' : 'Reactivate staff member'
                  }
                  onPress={handleToggleActive}
                  danger={isActive}
                />
                <ActionRow
                  compact
                  icon="trash-outline"
                  title="Delete staff profile"
                  onPress={handleDeleteStaff}
                  danger
                  last
                />
              </View>
            </>
          ) : (
            <>
              {/* ===== EDIT MODE: COMPACT HEADER ===== */}
              <View style={styles.editHeader}>
                <Pressable
                  onPress={() => setPhotoSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  style={styles.editAvatarWrap}
                >
                  <Avatar
                    name={fullName || staff.fullName}
                    photoUri={photoUri ?? null}
                    size={88}
                  />
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
                <View style={styles.editHeaderText}>
                  <Text style={styles.editTitle}>Editing profile</Text>
                  <Text style={styles.editSubtitle} numberOfLines={1}>
                    Tap the photo to change it
                  </Text>
                </View>
              </View>

              {/* ===== EDIT MODE: FORM ===== */}
              <Text style={styles.sectionTitle}>Staff details</Text>
              <View style={[styles.card, styles.formCard]}>
                <View style={styles.fieldGap}>
                  <TextField
                    label="Full name"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    maxLength={80}
                  />
                </View>
                <TextField
                  label="Staff code"
                  value={staffCode}
                  onChangeText={setStaffCode}
                  autoCapitalize="characters"
                  maxLength={STAFF_CODE_MAX_LENGTH}
                />
                <Text style={styles.helperText}>
                  Exactly two letters or numbers. Leave blank to generate a new
                  code. Used to look this person up at the kiosk.
                </Text>
              </View>

              {/* ===== EDIT MODE: FOOTER ACTIONS ===== */}
              <View style={styles.editFooter}>
                <View style={styles.footerButton}>
                  <AppButton
                    title="Cancel"
                    variant="ghost"
                    onPress={handleCancelEdit}
                    disabled={saving}
                  />
                </View>
                <View style={styles.footerButton}>
                  <AppButton
                    title="Save changes"
                    onPress={handleSave}
                    loading={saving}
                    disabled={!hasChanges || saving}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===== PHOTO VIEWER ===== */}
      <Modal
        visible={photoViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoViewerOpen(false)}
      >
        <Pressable
          style={styles.photoViewerBackdrop}
          onPress={() => setPhotoViewerOpen(false)}
        >
          <Pressable
            style={styles.photoViewerCard}
            onPress={() => {}}
          >
            <Pressable
              onPress={() => setPhotoViewerOpen(false)}
              style={styles.photoViewerClose}
              accessibilityRole="button"
              accessibilityLabel="Close photo viewer"
            >
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
            {staff?.photoUri ? (
              <Image
                source={{ uri: staff.photoUri }}
                style={styles.photoViewerImage}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== PHOTO SOURCE SHEET ===== */}
      <Modal
        visible={photoSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setPhotoSheetOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Change profile photo</Text>
            <ActionRow
              icon="camera-outline"
              title="Take a photo"
              subtitle="Use the camera"
              onPress={handleTakePhoto}
            />
            <ActionRow
              icon="images-outline"
              title="Choose from library"
              subtitle="Pick an existing photo"
              onPress={handlePickFromLibrary}
              last
            />
            <View style={styles.sheetCancel}>
              <AppButton
                title="Cancel"
                variant="ghost"
                onPress={() => setPhotoSheetOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== FALLBACK PIN SHEET ===== */}
      <Modal
        visible={pinSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={closePinSheet}
      >
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.sheetBackdrop} onPress={closePinSheet}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {staff.staffPinHash ? 'Change fallback PIN' : 'Add fallback PIN'}
              </Text>
              <View style={styles.pinForm}>
                <View style={styles.fieldGap}>
                  <TextField
                    label="New PIN"
                    value={pin}
                    onChangeText={(t: string) => {
                      setPin(t.replace(/\D/g, ''));
                      setPinError('');
                    }}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                  />
                </View>
                <TextField
                  label="Confirm PIN"
                  value={pinConfirm}
                  onChangeText={(t: string) => {
                    setPinConfirm(t.replace(/\D/g, ''));
                    setPinError('');
                  }}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                />
                {pinError ? (
                  <Text style={styles.pinError}>{pinError}</Text>
                ) : (
                  <Text style={styles.helperText}>
                    4 to 6 digits. Staff can use it if face scan fails.
                  </Text>
                )}
                <View style={styles.pinButtons}>
                  <View style={styles.footerButton}>
                    <AppButton
                      title="Cancel"
                      variant="ghost"
                      onPress={closePinSheet}
                    />
                  </View>
                  <View style={styles.footerButton}>
                    <AppButton
                      title="Save PIN"
                      onPress={handleSavePin}
                      disabled={pin.length < 4 || pinConfirm.length < 4}
                    />
                  </View>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <PhonePairingModal
        visible={pairingOpen}
        staff={staff}
        onClose={() => setPairingOpen(false)}
        onPaired={() => {
          if (staffId) loadStaff(staffId);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Compact profile header (view mode) */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    ...shadow.card,
  },
  profileCardText: { flex: 1 },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
  },
  heroMetaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  codeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  codeChipText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate500,
  },

  /* Shared */
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  sectionTitleTight: {
    marginTop: spacing.lg,
  },
  rowCompact: {
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapPrimary: { backgroundColor: 'rgba(100,116,139,0.12)' },
  rowIconWrapDanger: { backgroundColor: 'rgba(220,38,38,0.1)' },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  infoLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.slate500,
  },
  infoValueWrap: {
    alignItems: 'flex-end',
  },
  infoValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },

  /* Primary action */
  primaryAction: {
    marginTop: spacing.lg,
  },

  /* Action rows */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  actionRowPressed: { backgroundColor: 'rgba(0,0,0,0.03)' },
  actionTextWrap: { flex: 1 },
  actionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.slate500,
  },

  /* Edit mode */
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  editAvatarWrap: {
    width: 88,
    height: 88,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.slate900,
  },
  sheetCancel: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  pinForm: {
    paddingHorizontal: spacing.lg,
  },
  pinError: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.danger,
  },
  pinButtons: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  editHeaderText: { flex: 1 },
  editTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
  },
  editSubtitle: {
    marginTop: 2,
    fontSize: fontSize.md,
    color: colors.slate500,
  },
  formCard: {
    padding: spacing.md,
  },
  fieldGap: {
    marginBottom: spacing.md,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.slate500,
  },
  editFooter: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerButton: { flex: 1 },
  avatarPressable: {
    borderRadius: 36,
    overflow: 'hidden',
  },
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerCard: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  photoViewerClose: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: '100%',
  },
});
