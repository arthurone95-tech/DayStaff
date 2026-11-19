import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
  clearPersonalPinFailures,
  clearStaffDeviceCredential,
  deleteStaffProfile,
  getStaffById,
  getStaffByGroup,
  setStaffActive,
  setStaffFaceEmbeddings,
  setStaffPhotoAndFaceSignature,
  setStaffPin,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import type { Staff } from '../../types';
import { AdminPinModal } from '../auth/AdminPinModal';
import { PersonalPinModal } from '../../components/PersonalPinModal';
import { FaceScanPanel } from '../kiosk/FaceScanPanel';
import {
  analyzeFace,
  extractFaceEmbedding,
  prepareFaceEngine,
  prepareFacePhoto,
  serializeFaceEmbedding,
} from '../../services/faceEngine';
import {
  filterEnrollmentFrames,
  hashPersonalPin,
  isPersonalPinUsedByGroup,
  setPersonalStaffPin,
} from '../../services/lookalikeService';
import { PhonePairingModal } from '../../components/PhonePairingModal';
import { findDuplicateFace } from '../../services/faceRecognitionService';
import { STAFF_CODE_MAX_LENGTH } from '../../config/app';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffProfile'>;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ---------- Small building blocks ---------- */

function ActionRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  danger,
  last,
  compact,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  // Optional status chip shown before the chevron (e.g. "Enrolled", "Set").
  badge?: { label: string; tone: React.ComponentProps<typeof Badge>['tone'] };
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
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
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
  const [staffCodeError, setStaffCodeError] = useState('');
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
  const [faceScanOpen, setFaceScanOpen] = useState(false);
  const [faceScanTrigger, setFaceScanTrigger] = useState(0);
  const [faceBusy, setFaceBusy] = useState(false);
  const [adminPinVisible, setAdminPinVisible] = useState(false);
  const [personalPinVisible, setPersonalPinVisible] = useState(false);

  // Keep the standard header back button available while editing, but make
  // it close the editor instead of leaving the screen.
  useEffect(() => {
    navigation.setOptions({
      headerBackVisible: true,
      headerLeft: editing
        ? () => (
            <Pressable
              onPress={() => setEditing(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to profile"
              style={({ pressed }) => [{ paddingHorizontal: 6, paddingVertical: 6 }, pressed && { opacity: 0.55 }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
          )
        : undefined,
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

  const handleUpdateFaceScan = async (
    frames: string[],
    embedding: number[] | null,
  ) => {
    if (!staffId || !staff) return;
    setFaceBusy(true);
    try {
      const engineReady = await prepareFaceEngine();
      let keptEmbeddings: number[][] = [];
      let liveEmbedding = embedding;
      if (frames.length > 0 && engineReady) {
        const analyses = await Promise.all(
          frames.map((uri) => prepareFacePhoto(uri).then((upright) => analyzeFace(upright))),
        );
        const kept = filterEnrollmentFrames(analyses);
        keptEmbeddings = kept.map((analysis) => analysis.embedding);
        liveEmbedding = keptEmbeddings[0] ?? liveEmbedding;
      } else if (!liveEmbedding && frames.length > 0) {
        liveEmbedding = await extractFaceEmbedding(frames[0]);
        keptEmbeddings = liveEmbedding ? [liveEmbedding] : [];
      }
      if (!liveEmbedding) {
        throw new Error('The scan could not be converted into a face signature.');
      }
      const signature = serializeFaceEmbedding(liveEmbedding);

      // Guard against re-registering a face that already belongs to another
      // staff member, mirroring the registration flow.
      const duplicate = await findDuplicateFace(signature, staffId, keptEmbeddings);
      if (duplicate) {
        alert({
          tone: 'warning',
          title: 'Face already registered',
          message: `This face is already registered under ${duplicate.staff.fullName} (${duplicate.staff.staffCode}).`,
        });
        return;
      }

      setStaffPhotoAndFaceSignature(staffId, frames[0] ?? null, signature);
      if (keptEmbeddings.length > 0) {
        setStaffFaceEmbeddings(staffId, keptEmbeddings);
      }
      loadStaff(staffId);
      setFaceScanOpen(false);
      alert({
        tone: 'success',
        title: 'Face scan updated',
        message: `${staff.fullName}'s face scan has been updated.`,
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Could not update face scan',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setFaceBusy(false);
    }
  };

  const handleSave = async () => {
    if (!staff || !staffId) return;

    if (!fullName.trim()) {
      alert({
        tone: 'warning',
        title: 'Name required',
        message: 'Please enter a staff name.',
      });
      return;
    }

    setSaving(true);
    try {
      const normalizedCode = staffCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!normalizedCode) {
        setStaffCodeError('Staff code cannot be empty.');
        setSaving(false);
        return;
      }
      if (!/^[A-Z][0-9]$/.test(normalizedCode)) {
        setStaffCodeError(
          'Staff code must be exactly one letter followed by one number.',
        );
        setSaving(false);
        return;
      }
      updateStaff(staffId, {
        fullName: fullName.trim(),
        staffCode: normalizedCode,
        photoUri: photoUri ?? null,
        faceSignature: staff.faceSignature,
      });
      setStaff(getStaffById(staffId) ?? null);
      setEditing(false);
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
                <Pressable
                  onPress={() => setEditing(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                  style={({ pressed }) => [
                    styles.editPill,
                    pressed && styles.editPillPressed,
                  ]}
                >
                  <Ionicons name="create-outline" size={16} color={colors.slate700} />
                  <Text style={styles.editPillText}>Edit</Text>
                </Pressable>
              </View>

              {/* ===== VIEW MODE: SIGN-IN METHODS ===== */}
              <Text style={[styles.sectionTitle, styles.sectionTitleTight]}>
                Sign-in methods
              </Text>
              <View style={styles.card}>
                <ActionRow
                  compact
                  icon="scan-outline"
                  title="Face scan"
                  subtitle={
                    staff.faceSignature
                      ? 'Rescan if appearance changes'
                      : 'Scan to enable face sign-in'
                  }
                  badge={{
                    label: staff.faceSignature ? 'Enrolled' : 'Not enrolled',
                    tone: staff.faceSignature ? 'success' : 'neutral',
                  }}
                  onPress={() => {
                    setFaceScanTrigger(0);
                    setFaceScanOpen(true);
                  }}
                />
                <ActionRow
                  compact
                  icon="key-outline"
                  title="Fallback PIN"
                  subtitle="Used when face scan fails"
                  badge={{
                    label: staff.staffPinHash ? 'Set' : 'Not set',
                    tone: staff.staffPinHash ? 'success' : 'neutral',
                  }}
                  onPress={openPinSheet}
                  last={!staff.requiresPin}
                />
                {staff.requiresPin ? (
                  <ActionRow
                    compact
                    icon="shield-checkmark-outline"
                    title="Personal PIN"
                    subtitle="Look-alike PIN"
                    badge={{
                      label: staff.personalPinHash ? 'Set' : 'Not set',
                      tone: staff.personalPinHash ? 'success' : 'neutral',
                    }}
                    onPress={() => setAdminPinVisible(true)}
                    last
                  />
                ) : null}
              </View>

              {/* ===== VIEW MODE: ACCOUNT ===== */}
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.card}>
                <ActionRow
                  compact
                  icon={isActive ? 'person-remove-outline' : 'person-add-outline'}
                  title={
                    isActive ? 'Deactivate staff member' : 'Reactivate staff member'
                  }
                  subtitle={
                    isActive
                      ? 'Hide from the kiosk. Records are kept.'
                      : 'Show on the kiosk again.'
                  }
                  onPress={handleToggleActive}
                  danger={isActive}
                />
                <ActionRow
                  compact
                  icon="trash-outline"
                  title="Delete staff profile"
                  subtitle="Permanently removes face data and photos"
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
                    <Ionicons name="camera" size={14} color={colors.white} />
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
                  onChangeText={(value: string) => {
                    setStaffCode(value);
                    setStaffCodeError('');
                  }}
                  autoCapitalize="characters"
                  maxLength={STAFF_CODE_MAX_LENGTH}
                />
                <Text style={styles.helperText}>
                  Should be a letter followed by a number (e.g. A1). Used to look
                  this person up at the kiosk.
                </Text>
                {staffCodeError ? (
                  <Text style={styles.fieldError}>{staffCodeError}</Text>
                ) : null}
              </View>

              {/* ===== EDIT MODE: FOOTER ACTIONS ===== */}
              <View style={styles.editFooter}>
                <View style={[styles.footerButton, { flex: 1 }]}>
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

      <Modal
        visible={faceScanOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFaceScanOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.faceScanOverlay}>
          <View style={styles.faceScanCard}>
            <View style={styles.faceScanHeader}>
              <Text style={styles.editTitle}>Update face scan</Text>
              <Pressable
                onPress={() => setFaceScanOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.faceScanClose}
              >
                <Ionicons name="close" size={22} color={colors.slate700} />
              </Pressable>
            </View>
            <Text style={styles.editSubtitle}>
              {staff?.fullName}
            </Text>
            <FaceScanPanel
              busy={faceBusy}
              profileCount={1}
              engineAvailable={null}
              showCameraFlip
              triggerScan={faceScanTrigger}
              onScanStart={() => {}}
              onScanEnd={() => {}}
              onScanned={(frames, embedding) =>
                void handleUpdateFaceScan(frames, embedding)
              }
            />
            <AppButton
              title="Scan face"
              onPress={() => setFaceScanTrigger((value) => value + 1)}
              disabled={faceBusy}
              style={styles.pinButtons}
            />
          </View>
        </View>
      </Modal>

      <AdminPinModal
        visible={adminPinVisible}
        onClose={() => setAdminPinVisible(false)}
        onSuccess={() => {
          setAdminPinVisible(false);
          setPersonalPinVisible(true);
        }}
      />

      <PersonalPinModal
        visible={personalPinVisible}
        staffId={staff?.id ?? null}
        personName={staff?.fullName ?? ''}
        personPhotoUri={staff?.photoUri ?? null}
        mode="create"
        onClose={() => setPersonalPinVisible(false)}
        onSuccess={async (pin) => {
          if (!staffId || !staff) return;
          const groupMembers = staff.similarGroupId
            ? getStaffByGroup(staff.similarGroupId).filter((member) => member.id !== staff.id)
            : [];
          for (const member of groupMembers) {
            if (await isPersonalPinUsedByGroup(member.id, pin, [member])) {
              alert({
                tone: 'danger',
                title: 'PIN already in use',
                message: 'PINs must be different for look-alikes.',
              });
              setPersonalPinVisible(true);
              return;
            }
          }
          await setPersonalStaffPin(staffId, pin);
          clearPersonalPinFailures(staffId);
          loadStaff(staffId);
          setPersonalPinVisible(false);
          alert({
            tone: 'success',
            title: 'Personal PIN saved',
            message: `${staff.fullName}'s personal PIN has been updated.`,
          });
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

  /* Edit pill (profile header) */
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  editPillPressed: { opacity: 0.7 },
  editPillText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate700,
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
  faceScanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  faceScanClose: {
    padding: spacing.xs,
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
  fieldError: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
    fontWeight: '600',
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
  faceScanOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  faceScanCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
    maxHeight: '90%',
  },
});
