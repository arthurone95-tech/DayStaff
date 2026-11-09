import { Ionicons } from '@expo/vector-icons';
import { Alert } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAppDialog } from '../../components/AppDialog';
import {
  getStaffById,
  resetStaffPin,
  setStaffActive,
  updateStaff,
} from '../../database/queries';
import type { RootStackParamList } from '../../navigation/types';
import type { Staff } from '../../types';
import { colors, fontSize, radius, shadow, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffProfile'>;

export function StaffProfileScreen({
  navigation,
  route,
}: Props) {
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
      message:
        'This will save the updated staff details. Continue?',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setSaving(true);
        try {
          const normalizedCode = staffCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
          updateStaff(staffId, {
            fullName: fullName.trim(),
            staffCode: normalizedCode || undefined,
            photoUri: staff.photoUri,
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

  const handleResetPin = () => {
    if (!staffId) return;
    confirm({
      tone: 'warning',
      icon: 'key-outline',
      title: 'Reset fallback PIN?',
      message:
        'This will remove this staff member’s fallback PIN. They will need to set a new PIN the next time they edit their profile.',
      confirmLabel: 'Reset PIN',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => {
        resetStaffPin(staffId);
        loadStaff(staffId);
        alert({
          tone: 'success',
          title: 'PIN reset',
          message: `${staff?.fullName}’s fallback PIN has been cleared.`,
        });
      },
    });
  };

  const handleToggleActive = () => {
    if (!staffId || !staff) return;
    const nextActive = !isActive;
    confirm({
      tone: nextActive ? 'question' : 'danger',
      icon: nextActive ? 'person-add-outline' : 'person-remove-outline',
      title: nextActive
        ? 'Reactivate staff member?'
        : 'Deactivate staff member?',
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

  const hasChanges =
    fullName.trim() !== (staff?.fullName ?? '').trim() ||
    staffCode.toUpperCase() !== (staff?.staffCode ?? '').toUpperCase() ||
    isActive !== (staff?.isActive === 1);

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
        >
          {/* ===== HEADER SECTION ===== */}
          <View style={styles.headerSection}>
            <Avatar
              name={staff.fullName}
              photoUri={staff.photoUri}
              size={88}
            />
            <View style={styles.headerContent}>
              <View style={styles.nameRow}>
                {editing ? (
                  <View style={styles.nameInputWrap}>
                    <TextField
                      label="Full name"
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                      maxLength={80}
                    />
                  </View>
                ) : (
                  <Text style={styles.profileName}>{staff.fullName}</Text>
                )}
              </View>
              <View style={styles.statusBadgeWrap}>
                <Badge
                  label={isActive ? 'Active' : 'Inactive'}
                  tone={isActive ? 'success' : 'neutral'}
                />
              </View>
              <Text style={styles.profileCode}>
                {staff.staffCode ? `#${staff.staffCode}` : 'No staff code'}
              </Text>
            </View>
          </View>

          {/* ===== INFO SECTION ===== */}
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Staff profile</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Face profile</Text>
                <Text style={styles.infoValue}>
                  {staff.faceSignature ? 'Enrolled' : 'Not enrolled'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fallback PIN</Text>
                <Text style={styles.infoValue}>
                  {staff.staffPinHash ? 'Set' : 'Not set'}
                </Text>
              </View>
            </View>
          </View>

          {/* ===== ACTIONS SECTION (view mode) ===== */}
          {!editing && (
            <View style={styles.actionsSection}>
              <AppButton
                title={isActive ? 'Deactivate' : 'Reactivate'}
                onPress={handleToggleActive}
                variant={isActive ? 'danger' : 'success'}
                size="sm"
                fullWidth={false}
              />
              <AppButton
                title="Reset fallback PIN"
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={handleResetPin}
                icon={
                  <Ionicons name="key-outline" size={18} color={colors.danger} />
                }
              />
              <AppButton
                title="Edit profile"
                onPress={() => setEditing(true)}
                size="sm"
                fullWidth={false}
              />
            </View>
          )}

          {/* ===== EDIT SECTION (edit mode) ===== */}
          {editing && (
            <View style={styles.editSection}>
              <View style={styles.editCard}>
                <View style={styles.editRow}>
                  <TextField
                    label="Staff code"
                    value={staffCode}
                    onChangeText={setStaffCode}
                    autoCapitalize="characters"
                    maxLength={20}
                  />
                </View>
                <View style={styles.resetPinRow}>
                  <AppButton
                    title="Reset fallback PIN"
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    onPress={handleResetPin}
                    icon={
                      <Ionicons
                        name="key-outline"
                        size={18}
                        color={colors.danger}
                      />
                    }
                  />
                </View>
                <View style={styles.saveCancelRow}>
                  <AppButton
                    title="Cancel"
                    onPress={() => {
                      if (!staffId) return;
                      loadStaff(staffId);
                      setEditing(false);
                    }}
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                  />
                  <AppButton
                    title="Save changes"
                    onPress={handleSave}
                    loading={saving}
                    size="sm"
                    fullWidth={false}
                    disabled={!hasChanges || saving}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerSection: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headerContent: {
    alignItems: 'center',
    marginTop: spacing.md,
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.xs,
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  nameInputWrap: {
    width: 240,
  },
  statusBadgeWrap: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  profileCode: {
    fontSize: fontSize.sm,
    color: colors.slate500,
    textAlign: 'center',
  },
  infoSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: fontSize.md,
    color: colors.slate500,
  },
  infoValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.slate900,
  },
  actionsSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  editSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  editCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  editRow: {
    marginBottom: spacing.lg,
  },
  resetPinRow: {
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
  },
  saveCancelRow: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
});
