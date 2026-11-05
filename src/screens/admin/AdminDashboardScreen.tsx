import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { ActionTile } from '../../components/ActionTile';
import { Badge, dayStatusMeta } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StaffRow, type StaffRowHighlight } from '../../components/StaffRow';
import { StatTile } from '../../components/StatTile';
import { getSchedule, getSetting } from '../../database/queries';
import {
  DEFAULT_SCHOOL_NAME,
  SCHOOL_NAME_SETTING,
} from '../../database/seed';
import type { RootNavigation } from '../../navigation/types';
import { buildDailySummary } from '../../services/attendanceLogic';
import { colors, fontSize, spacing } from '../../theme';
import type { DailySummary, DayStatus, Schedule } from '../../types';
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

function highlightFor(status: DayStatus): StaffRowHighlight {
  switch (status) {
    case 'late':
      return 'warning';
    case 'early_exit':
      return 'danger';
    case 'absent':
      return 'none';
    case 'on_time':
      return 'success';
    default:
      return 'info';
  }
}

export function AdminDashboardScreen() {
  const navigation = useNavigation<RootNavigation>();
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_NAME);

  useFocusEffect(
    useCallback(() => {
      setSummary(buildDailySummary(todayKey()));
      setSchedule(getSchedule());
      setSchoolName(getSetting(SCHOOL_NAME_SETTING) ?? DEFAULT_SCHOOL_NAME);
    }, []),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.hero}>
          <Text style={styles.heroLabel}>{schoolName}</Text>
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
          />
          <StatTile label="Present" value={summary.present} tone="success" />
          <StatTile label="Late" value={summary.late} tone="warning" />
          <StatTile
            label="Clocked out"
            value={summary.clockedOut}
            tone="info"
          />
          <StatTile
            label="Early exit"
            value={summary.earlyExit}
            tone="danger"
          />
          <StatTile label="Absent" value={summary.absent} tone="neutral" />
        </View>

        <Text style={styles.sectionTitle}>Manage</Text>
        <View style={styles.actionsGrid}>
          <ActionTile
            icon="person-add-outline"
            label="Add staff"
            onPress={() => navigation.navigate('RegisterStaff')}
          />
          <ActionTile
            icon="people-outline"
            label="Staff list"
            tone="info"
            onPress={() => navigation.navigate('StaffList')}
          />
          <ActionTile
            icon="time-outline"
            label="Schedule"
            tone="warning"
            onPress={() => navigation.navigate('ScheduleSettings')}
          />
          <ActionTile
            icon="download-outline"
            label="Export"
            tone="success"
            onPress={() => navigation.navigate('ExportReports')}
          />
          <ActionTile
            icon="settings-outline"
            label="Settings"
            onPress={() => navigation.navigate('AdminSettings')}
          />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Today's attendance</Text>
          <Text style={styles.listCount}>
            {summary.totalStaff - summary.absent}/{summary.totalStaff} checked
            in
          </Text>
        </View>

        <Card padded={false} style={styles.listCard}>
          {summary.records.length === 0 ? (
            <EmptyState
              icon="person-add-outline"
              title="No staff yet"
              message="Register your first staff member to start recording attendance."
              actionLabel="Add staff"
              onAction={() => navigation.navigate('RegisterStaff')}
            />
          ) : (
            summary.records.map((record) => {
              const meta = dayStatusMeta(record.status);
              return (
                <StaffRow
                  key={record.staff.id}
                  staff={record.staff}
                  highlight={highlightFor(record.status)}
                  badge={<Badge label={meta.label} tone={meta.tone} />}
                  caption={record.staff.phoneNumber || 'No phone number'}
                  detail={
                    record.log
                      ? `In ${formatTime12h(record.log.clockInTime)}${
                          record.log.clockOutTime
                            ? ` · Out ${formatTime12h(record.log.clockOutTime)}`
                            : ''
                        }`
                      : 'No clock-in recorded'
                  }
                  onPress={() =>
                    navigation.navigate('RegisterStaff', {
                      staffId: record.staff.id,
                    })
                  }
                />
              );
            })
          )}
        </Card>

        <Text style={styles.footnote}>
          Tap a staff member to edit their profile.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  listCount: {
    marginBottom: spacing.md,
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
