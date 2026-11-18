import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { AppButton } from '../../components/AppButton';
import { useAppDialog } from '../../components/AppDialog';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StaffRow } from '../../components/StaffRow';
import { getAllStaff } from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import {
  importBackupMerge,
  pickBackupFile,
  replaceConflictingStaff,
  type ImportConflict,
  type BackupSnapshot,
} from '../../services/backupService';
import { colors, fontSize, radius, spacing } from '../../theme';
import type { Staff } from '../../types';

export function StaffListScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert, confirm } = useAppDialog();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((member) => {
      const name = member.fullName.toLowerCase();
      const code = (member.staffCode ?? '').toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }, [staff, search]);

  const refresh = useCallback(() => {
    setStaff(getAllStaff());
  }, []);

  useFocusEffect(refresh);

  const activeCount = staff.filter((member) => member.isActive === 1).length;

  const handleReplaceConflicts = (
    conflicts: ImportConflict[],
    snapshot: BackupSnapshot,
    baseMessage: string,
  ) => {
    if (conflicts.length === 0) {
      alert({
        tone: 'success',
        title: 'Import complete',
        message: baseMessage,
        buttonLabel: 'Done',
        onClose: refresh,
      });
      return;
    }

    const names = conflicts
      .slice(0, 5)
      .map((c) => `• ${c.backupName} (${c.staffCode})`)
      .join('\n');
    const more = conflicts.length > 5 ? `\n• +${conflicts.length - 5} more` : '';

    confirm({
      tone: 'warning',
      icon: 'warning-outline',
      title: 'Some staff were not imported',
      message:
        `${baseMessage}\n\n` +
        `These staff members were skipped because a staff profile with the same staff code already exists:\n${names}${more}\n\n` +
        'Replace the existing profiles with the imported ones? Attendance logs from the backup will be merged.',
      confirmLabel: 'Replace',
      cancelLabel: 'Keep existing',
      onConfirm: () => {
        try {
          const replaced = replaceConflictingStaff(conflicts, snapshot);
          alert({
            tone: 'success',
            title: 'Import finished',
            message:
              `${replaced.replacedStaff} profile(s) replaced and ${replaced.mergedLogs} attendance record(s) merged from the backup.`,
            buttonLabel: 'Done',
            onClose: refresh,
          });
        } catch (error) {
          alert({
            tone: 'danger',
            title: 'Could not replace profiles',
            message: error instanceof Error ? error.message : 'Please try again.',
            onClose: refresh,
          });
        }
      },
      onCancel: () => {
        alert({
          tone: 'info',
          title: 'Existing profiles kept',
          message:
            'Conflicting staff were not imported. You can register them again to get new staff codes.',
          buttonLabel: 'OK',
          onClose: refresh,
        });
      },
    });
  };

  const handleImport = async () => {
    if (importing) return;
    try {
      const picked = await pickBackupFile();
      if (picked.canceled) return;
      setImporting(true);
      const { summary, snapshot } = await importBackupMerge(picked.uri);
      const baseMessage =
        `Imported ${summary.importedStaff} staff member(s) and ${summary.importedLogs} attendance record(s).` +
        (summary.conflicts.length > 0
          ? `\n${summary.conflicts.length} staff member(s) were skipped due to matching staff codes.`
          : '');
      handleReplaceConflicts(summary.conflicts, snapshot, baseMessage);
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Import failed',
        message:
          error instanceof Error
            ? error.message
            : 'Could not import the selected backup file.',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen>
      <FlatList
        data={filteredStaff}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerActions}>
              <View style={styles.headerAction}>
                <AppButton
                  title="Add staff"
                  onPress={() => navigation.navigate('RegisterStaff')}
                  icon={
                    <Ionicons
                      name="person-add-outline"
                      size={18}
                      color={colors.white}
                    />
                  }
                />
              </View>
              <View style={styles.headerAction}>
                <AppButton
                  title={importing ? 'Importing…' : 'Import'}
                  onPress={handleImport}
                  variant="secondary"
                  loading={importing}
                  disabled={importing}
                  icon={
                    !importing ? (
                      <Ionicons
                        name="download-outline"
                        size={18}
                        color={colors.primary}
                      />
                    ) : undefined
                  }
                />
              </View>
            </View>
            {staff.length > 0 ? (
              <>
                <Text style={styles.summary}>
                  {staff.length} total · {activeCount} active · {staff.length - activeCount} deactivated
                </Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Staff code or name"
                  placeholderTextColor={colors.slate400}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchInput}
                />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          staff.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No staff registered"
              message="Add staff so they can clock in and out at this terminal."
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No staff match"
              message="Try a different name or staff code."
            />
          )
        }
        renderItem={({ item }) => (
          <StaffRow
            staff={item}
            caption={
              item.staffCode ? `#${item.staffCode}` : 'No staff code'
            }
            badge={
              <Badge
                label={item.isActive ? 'Active' : 'Inactive'}
                tone={item.isActive ? 'success' : 'neutral'}
              />
            }
            detail={item.isActive ? 'Tap to edit' : 'Hidden from kiosk'}
            onPress={() =>
              navigation.navigate('StaffProfile', { staffId: item.id })
            }
          />
        )}
      />
      <AdminBottomTabBar navigation={navigation} active="StaffList" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    padding: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerAction: {
    flex: 1,
  },
  summary: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate500,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  searchInput: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: fontSize.md,
    color: colors.slate900,
  },
});
