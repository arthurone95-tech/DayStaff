import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { ActionTile } from '../../components/ActionTile';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StaffRow, type StaffRowHighlight } from '../../components/StaffRow';
import { StatTile } from '../../components/StatTile';
import { getSchedule } from '../../database/queries';
import type { RootNavigation } from '../../navigation/types';
import { getCompanyName } from '../../services/appSettings';
import { buildDailySummary } from '../../services/attendanceLogic';
import { colors, fontSize, spacing } from '../../theme';
import type { DailySummary, Schedule, StaffDayRecord } from '../../types';
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

function highlightFor(record: {
  log: StaffDayRecord['log'];
}): StaffRowHighlight {
  if (!record.log) {
    return 'none';
  }
  if (record.log.clockOutStatus === 'early') {
    return 'danger';
  }
  if (record.log.clockInStatus === 'late') {
    return 'warning';
  }
  if (record.log.clockOutTime) {
    return 'info';
  }
  return 'success';
}

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

  return (
    <Screen>
      <ScrollView
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
              const { log } = record;
              const arrival: { label: string; tone: BadgeTone } = !log
                ? { label: 'Absent', tone: 'neutral' }
                : log.clockInStatus === 'late'
                  ? { label: 'Late', tone: 'warning' }
                  : { label: 'Present', tone: 'success' };

              const departure: { label: string; tone: BadgeTone } | null =
                log?.clockOutTime
                  ? log.clockOutStatus === 'early'
                    ? { label: 'Early exit', tone: 'danger' }
                    : { label: 'Clocked out', tone: 'info' }
                  : null;

              const detailBits: string[] = [];
              if (log) {
                detailBits.push(`In ${formatTime12h(log.clockInTime)}`);
                if (log.clockInStatus === 'late') {
                  detailBits.push(`${log.minutesLate}m late`);
                }
                if (log.clockOutTime) {
                  detailBits.push(`Out ${formatTime12h(log.clockOutTime)}`);
                }
                if (log.clockOutStatus === 'early') {
                  detailBits.push(`${log.minutesEarly}m early`);
                }
              }

              return (
                <StaffRow
                  key={record.staff.id}
                  staff={record.staff}
                  highlight={highlightFor(record)}
                  badge={
                    <View style={styles.badges}>
                      <Badge label={arrival.label} tone={arrival.tone} />
                      {departure ? (
                        <Badge
                          label={departure.label}
                          tone={departure.tone}
                        />
                      ) : null}
                    </View>
                  }
                  caption={
                    record.staff.staffCode
                      ? `#${record.staff.staffCode}`
                      : 'No staff code'
                  }
                  detail={
                    log ? detailBits.join(' · ') : 'No clock-in recorded'
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    color: colors.slate400,
    textAlign: 'center',
  },
});
