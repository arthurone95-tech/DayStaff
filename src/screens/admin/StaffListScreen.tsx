import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StaffRow } from '../../components/StaffRow';
import { useAppDialog } from '../../components/AppDialog';
import { getAllStaff, resetStaffPin } from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import { colors, fontSize, spacing } from '../../theme';
import type { Staff } from '../../types';

export function StaffListScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { alert, confirm } = useAppDialog();
  const [staff, setStaff] = useState<Staff[]>([]);

  useFocusEffect(
    useCallback(() => {
      setStaff(getAllStaff());
    }, []),
  );

  const activeCount = staff.filter((member) => member.isActive === 1).length;

  const handleResetPin = (member: Staff) => {
    confirm({
      tone: 'warning',
      icon: 'key-outline',
      title: 'Reset fallback PIN?',
      message:
        'This will remove the staff member’s fallback PIN. They will need to set a new PIN the next time they edit their profile.',
      confirmLabel: 'Reset PIN',
      destructive: true,
      onConfirm: () => {
        resetStaffPin(member.id);
        setStaff(getAllStaff());
        alert({
          tone: 'success',
          title: 'PIN reset',
          message: `${member.fullName}’s fallback PIN has been cleared.`,
        });
      },
    });
  };

  return (
    <Screen>
      <FlatList
        data={staff}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppButton
              title="Add staff member"
              onPress={() => navigation.navigate('RegisterStaff')}
              icon={
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color={colors.white}
                />
              }
            />
            <Text style={styles.summary}>
              {staff.length} total · {activeCount} active · {staff.length - activeCount} deactivated
            </Text>
            <Text style={styles.hint}>
              Tap a staff member to edit their details or deactivate them.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No staff registered"
            message="Add staff so they can clock in and out at this terminal."
            actionLabel="Add staff"
            onAction={() => navigation.navigate('RegisterStaff')}
          />
        }
        renderItem={({ item }) => (
          <StaffRow
            staff={item}
            caption={
              item.staffCode ? `#${item.staffCode}` : 'No staff code'
            }
            badge={
              <>
                <Badge
                  label={item.isActive ? 'Active' : 'Inactive'}
                  tone={item.isActive ? 'success' : 'neutral'}
                />
                {!item.staffPinHash ? (
                  <Badge label="PIN needed" tone="warning" />
                ) : null}
              </>
            }
            detail={item.isActive ? 'Tap to edit' : 'Hidden from kiosk'}
            onPress={() =>
              navigation.navigate('RegisterStaff', { staffId: item.id })
            }
            onResetPin={() => handleResetPin(item)}
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
});
