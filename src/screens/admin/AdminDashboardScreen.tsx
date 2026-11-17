import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StaffRow } from '../../components/StaffRow';
import { StatTile } from '../../components/StatTile';
import { getSchedule } from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import { getCompanyName } from '../../services/appSettings';
import { buildDailySummary } from '../../services/attendanceLogic';
import { colors, fontSize, spacing } from '../../theme';
import type { DailySummary, Schedule } from '../../types';
import {
  formatClockTime,
  formatDateLong,
  formatTime12h,
  todayKey,
} from '../../utils/date';

const EMPTY_SUMMARY: DailySummary = {
  date: todayKey(),
  totalStaff: 0,
  present: 0,
  late: 0,
  absent: 0,
  clockedOut: 0,
  earlyExit: 0,
  records: [],
};

export function AdminDashboardScreen() {
  const navigation = useNavigation<RootNavigation>();
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [companyName, setCompanyName] = useState(getCompanyName());

  useFocusEffect(
    useCallback(() => {
      setSummary(buildDailySummary(todayKey()));
      setSchedule(getSchedule());
      setCompanyName(getCompanyName());
    }, []),
  );

  const pendingRecords = summary.records.filter((record) => !record.log);
  const checkedInRecords = summary.records.filter((record) => record.log);

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.hero}>
          <Text style={styles.heroLabel}>{companyName}</Text>
          <Text style={styles.heroDate}>{formatDateLong(new Date())}</Text>
          {schedule ? (
            <Text style={styles.heroMeta}>
              Official hours {formatClockTime(schedule.startTime)} –{' '}
              {formatClockTime(schedule.endTime)}
              {schedule.lateThresholdMinutes > 0
                ? ` · ${schedule.lateThresholdMinutes} min grace`
                : ''}
            </Text>
          ) : null}
        </Card>

        <View style={styles.statsGrid}>
          <StatTile
            label="Total staff"
            value={summary.totalStaff}
            tone="neutral"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'all' })}
          />
          <StatTile
            label="Present"
            value={summary.present}
            tone="success"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'present' })}
          />
          <StatTile
            label="Late"
            value={summary.late}
            tone="warning"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'late' })}
          />
          <StatTile
            label="Clocked out"
            value={summary.clockedOut}
            tone="info"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'clockedOut' })}
          />
          <StatTile
            label="Early exit"
            value={summary.earlyExit}
            tone="danger"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'earlyExit' })}
          />
          <StatTile
            label="Absent"
            value={summary.absent}
            tone="neutral"
            onPress={() => navigation.navigate('AttendanceHistory', { filter: 'absent' })}
          />
        </View>

        {checkedInRecords.length > 0 ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Today’s check-ins</Text>
              <Text style={styles.listCount}>
                {checkedInRecords.length} recorded
              </Text>
            </View>
            <Card padded={false} style={styles.listCard}>
              {checkedInRecords.map((record) =>
                record.log ? (
                  <StaffRow
                    key={record.staff.id}
                    staff={record.staff}
                    badge={
                      <Badge
                        label={
                          record.log.isManualOverride
                            ? 'Manual override'
                            : record.log.authMethod === 'QR_DEVICE_BOUND'
                              ? '📱 QR Code'
                              : '📷 Facial Scan'
                        }
                        tone={
                          record.log.isManualOverride
                            ? 'warning'
                            : record.log.authMethod === 'QR_DEVICE_BOUND'
                              ? 'info'
                              : 'neutral'
                        }
                      />
                    }
                    caption={
                      record.staff.staffCode
                        ? `#${record.staff.staffCode}`
                        : 'No staff code'
                    }
                    detail={
                      record.log.clockOutTime
                        ? `In ${formatTime12h(record.log.clockInTime)} · Out ${formatTime12h(record.log.clockOutTime)}`
                        : `Clocked in ${formatTime12h(record.log.clockInTime)}`
                    }
                    onPress={() =>
                      navigation.navigate('StaffProfile', {
                        staffId: record.staff.id,
                      })
                    }
                  />
                ) : null,
              )}
            </Card>
          </>
        ) : null}

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Not clocked in yet</Text>
          <Text style={styles.listCount}>
            {pendingRecords.length} awaiting
          </Text>
        </View>

        <Card padded={false} style={styles.listCard}>
          {summary.totalStaff === 0 ? (
            <EmptyState
              icon="person-add-outline"
              title="No staff yet"
              message="Register your first staff member to start recording attendance."
              actionLabel="Add staff"
              onAction={() => navigation.navigate('RegisterStaff')}
            />
          ) : pendingRecords.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Everyone is checked in"
              message="All active staff have clocked in today."
            />
          ) : (
            pendingRecords.map((record) => (
              <StaffRow
                key={record.staff.id}
                staff={record.staff}
                badge={<Badge label="Not clocked in" tone="neutral" />}
                caption={
                  record.staff.staffCode
                    ? `#${record.staff.staffCode}`
                    : 'No staff code'
                }
                detail="No clock-in recorded"
                onPress={() =>
                  navigation.navigate('StaffProfile', {
                    staffId: record.staff.id,
                  })
                }
              />
            ))
          )}
        </Card>

        <Text style={styles.footnote}>
          Tap a staff member to edit their profile.
        </Text>
      </ScrollView>
      <AdminBottomTabBar navigation={navigation} active="AdminDashboard" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.primary,
  },
  heroLabel: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  heroDate: {
    marginTop: spacing.xs,
    color: '#CBD5E1',
    fontSize: fontSize.sm,
  },
  heroMeta: {
    marginTop: spacing.sm,
    color: '#CBD5E1',
    fontSize: fontSize.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  listHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  listTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listCount: {
    fontSize: fontSize.xs,
    color: colors.slate500,
    fontWeight: '600',
  },
  listCard: {
    overflow: 'hidden',
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    color: colors.slate400,
    textAlign: 'center',
  },
});
