import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AdminBottomTabBar } from '../../components/AdminBottomTabBar';
import { useAppDialog } from '../../components/AppDialog';
import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { TimeField } from '../../components/TimeField';
import {
  getAttendanceDateKeys,
  getAttendanceWithStaffForDate,
  getSchedule,
  type AttendanceWithStaffRow,
} from '../../database/queries';
import { manualClockIn, manualClockOut } from '../../services/attendanceLogic';
import { exportAttendanceReportForDate } from '../../services/exportService';
import type { AttendanceFilter, RootNavigation } from '../../navigation/types';
import { colors, fontSize, radius, spacing } from '../../theme';
import {
  addDaysToKey,
  combineDateAndTime,
  formatDateLong,
  formatDateMedium,
  formatTime12h,
  monthLabel,
  parseDateKey,
  toDateKey,
  todayKey,
} from '../../utils/date';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_CELL_WIDTH = '14.2857%';

type ExportFormat = 'xlsx' | 'csv';

function QuickChip({
  label,
  active = false,
  icon,
  onPress,
  onLayout,
}: {
  label: string;
  active?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  onLayout?: (e: any) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.white : colors.primary}
        />
      ) : null}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatStatusSummary(records: AttendanceWithStaffRow[]): string {
  if (records.length === 0) {
    return 'No staff for this day';
  }
  const withLog = records.filter((record) => record.log);
  const parts = [`${records.length} staff`];
  parts.push(`${withLog.length} checked in`);
  const absent = records.length - withLog.length;
  if (absent > 0) {
    parts.push(`${absent} absent`);
  }
  return parts.join(' · ');
}

function isoToLocalTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

const OVERRIDE_REASONS = [
  'Camera glare',
  'Face injury',
  'Forgot to scan',
  'New hire',
];

function AttendanceRecordRow({
  record,
  onOverride,
}: {
  record: AttendanceWithStaffRow;
  onOverride: (record: AttendanceWithStaffRow) => void;
}) {
  const { staff, log } = record;
  const isLate = log?.clockInStatus === 'late';
  const isEarly = log?.clockOutStatus === 'early';
  const usesFace =
    !!staff.faceSignature || log?.authMethod === 'FACE_BIOMETRIC';
  const isManual = log?.isManualOverride === true;

  const statusLabel = !log
    ? 'Absent'
    : isEarly
      ? `Left early ${log.minutesEarly}m`
      : isLate
        ? `Late ${log.minutesLate}m`
        : 'On time';
  const statusTone = !log
    ? styles.statusAbsent
    : isLate || isEarly
      ? styles.statusDanger
      : styles.statusSuccess;

  const rowToneStyle = !log
    ? styles.recordRowNeutral
    : isLate || isEarly
      ? styles.recordRowDanger
      : log.clockOutTime
        ? styles.recordRowSuccess
        : styles.recordRowNeutral;

  return (
    <View
      accessibilityLabel={`${staff.fullName}, ${statusLabel}${
        log
          ? `, clocked in ${formatTime12h(log.clockInTime)}, clocked out ${
              log.clockOutTime ? formatTime12h(log.clockOutTime) : 'not yet'
            }`
          : ''
      }${isManual ? ', manual override' : ''}`}
      style={[styles.recordRow, rowToneStyle]}
    >
      <Avatar name={staff.fullName} photoUri={staff.photoUri} size={42} />

      <View style={styles.recordBody}>
        <View style={styles.recordTitleRow}>
          <Text style={styles.recordName} numberOfLines={1}>
            {staff.fullName}
          </Text>
          {usesFace ? (
            <Ionicons
              name="camera-outline"
              size={14}
              color={colors.slate400}
              style={styles.faceIcon}
              accessibilityLabel="Face scan"
            />
          ) : null}
          <Text style={styles.recordCode}>
            {staff.staffCode ? `#${staff.staffCode}` : 'No code'}
          </Text>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>IN</Text>
          <Text style={[styles.timeValue, isLate && styles.timeValueDanger]}>
            {log ? formatTime12h(log.clockInTime) : '—'}
          </Text>
          <Ionicons name="arrow-forward" size={11} color={colors.slate400} />
          <Text style={styles.timeLabel}>OUT</Text>
          <Text
            style={[
              styles.timeValue,
              isEarly && styles.timeValueDanger,
              (!log || !log.clockOutTime) && styles.timeValueMuted,
            ]}
          >
            {log?.clockOutTime ? formatTime12h(log.clockOutTime) : '—'}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <Text style={[styles.statusText, statusTone]}>{statusLabel}</Text>
            {isManual ? <Text style={styles.manualText}>· Manual</Text> : null}
          </View>
          <Pressable
            onPress={() => onOverride(record)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Override attendance for ${staff.fullName}`}
            style={({ pressed }) => [
              styles.overrideLink,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.overrideText}>Override</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function AttendanceHistoryScreen() {
  const navigation = useNavigation<RootNavigation>();
  const route = useRoute();
  const routeFilter = (route.params as { filter?: AttendanceFilter } | undefined)
    ?.filter;
  const { alert } = useAppDialog();
  const today = todayKey();

  const [selectedDateKey, setSelectedDateKey] = useState(today);
  const [records, setRecords] = useState<AttendanceWithStaffRow[]>([]);
  const [availableDates, setAvailableDates] = useState<Set<string>>(
    () => new Set(),
  );
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const selected = parseDateKey(today);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [exportVisible, setExportVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<AttendanceFilter>(routeFilter ?? 'all');
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const [chipWidths, setChipWidths] = useState<number[]>([]);

  const [overrideRecord, setOverrideRecord] =
    useState<AttendanceWithStaffRow | null>(null);
  const [overrideAction, setOverrideAction] = useState<
    'clock_in' | 'clock_out'
  >('clock_in');
  const [overrideTime, setOverrideTime] = useState('08:00');
  const [overrideNote, setOverrideNote] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const FILTER_ORDER: AttendanceFilter[] = [
    'all',
    'present',
    'late',
    'clockedOut',
    'earlyExit',
    'absent',
  ];

  const chipOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const width of chipWidths) {
      offsets.push(acc);
      acc += width + spacing.sm;
    }
    return offsets;
  }, [chipWidths]);

  const handleChipLayout = useCallback(
    (index: number) => (e: any) => {
      setChipWidths((prev) => {
        const next = [...prev];
        next[index] = e.nativeEvent.layout.width;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const activeIndex = FILTER_ORDER.indexOf(filter);
    if (activeIndex >= 0 && scrollRef.current) {
      scrollRef.current.scrollTo({
        x: chipOffsets[activeIndex],
        animated: true,
      });
    }
  }, [filter, chipOffsets]);

  useFocusEffect(
    useCallback(() => {
      setRecords(getAttendanceWithStaffForDate(selectedDateKey));
      setAvailableDates(new Set(getAttendanceDateKeys()));
    }, [selectedDateKey]),
  );

  const selectedDate = useMemo(
    () => parseDateKey(selectedDateKey),
    [selectedDateKey],
  );
  const isToday = selectedDateKey === today;

  const selectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    const date = parseDateKey(dateKey);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const shiftDay = (delta: number) => {
    selectDate(addDaysToKey(selectedDateKey, delta));
  };

  const openCalendar = () => {
    const selected = parseDateKey(selectedDateKey);
    setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setCalendarVisible(true);
  };

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  };

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; dateKey: string } | null> =
      Array(firstWeekday).fill(null);
    for (let day = 1; day <= dayCount; day += 1) {
      cells.push({
        day,
        dateKey: toDateKey(new Date(year, month, day)),
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [calendarMonth]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);
  const nextMonthDisabled =
    calendarMonth.getTime() >= currentMonth.getTime();
  const nextYearDisabled =
    new Date(
      calendarMonth.getFullYear() + 1,
      calendarMonth.getMonth(),
      1,
    ).getTime() > currentMonth.getTime();

  const handleExport = async () => {
    if (records.length === 0 || exporting) {
      return;
    }
    setExporting(true);
    try {
      const result = await exportAttendanceReportForDate({
        dateKey: selectedDateKey,
        format: exportFormat,
      });
      setExportVisible(false);
      const noun = result.rowCount === 1 ? 'record' : 'records';
      alert({
        tone: 'success',
        title: 'Report ready',
        message: `${result.rowCount} ${noun} included.\n\n${
          result.shared
            ? 'The native share sheet is open — send it via WhatsApp, email or Files.'
            : `Sharing is unavailable, so the file was saved to:\n${result.uri}`
        }`,
        buttonLabel: 'Done',
      });
    } catch (error) {
      alert({
        tone: 'danger',
        title: 'Export failed',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  const openOverride = (record: AttendanceWithStaffRow) => {
    const log = record.log;
    const schedule = getSchedule();
    const now = new Date();
    setOverrideRecord(record);
    setOverrideError(null);
    setOverrideNote(log?.overrideNote ?? '');

    if (!log) {
      setOverrideAction('clock_in');
      setOverrideTime(
        isToday ? isoToLocalTime(now.toISOString()) : schedule.startTime,
      );
      return;
    }
    if (!log.clockOutTime) {
      setOverrideAction('clock_out');
      setOverrideTime(
        isToday ? isoToLocalTime(now.toISOString()) : schedule.endTime,
      );
      return;
    }
    setOverrideAction('clock_out');
    setOverrideTime(isoToLocalTime(log.clockOutTime));
  };

  const selectOverrideAction = (action: 'clock_in' | 'clock_out') => {
    setOverrideAction(action);
    setOverrideError(null);
    const log = overrideRecord?.log ?? null;
    const schedule = getSchedule();
    const now = new Date();

    if (action === 'clock_in') {
      setOverrideTime(
        log
          ? isoToLocalTime(log.clockInTime)
          : isToday
            ? isoToLocalTime(now.toISOString())
            : schedule.startTime,
      );
      return;
    }
    if (log?.clockOutTime) {
      setOverrideTime(isoToLocalTime(log.clockOutTime));
      return;
    }
    setOverrideTime(
      isToday ? isoToLocalTime(now.toISOString()) : schedule.endTime,
    );
  };

  const handleSaveOverride = () => {
    if (!overrideRecord) {
      return;
    }
    if (overrideAction === 'clock_out' && !overrideRecord.log) {
      setOverrideError('Add a clock-in before adding a clock-out.');
      return;
    }

    const at = combineDateAndTime(selectedDateKey, overrideTime);
    if (isToday && at.getTime() > Date.now() + 60_000) {
      setOverrideError('Choose a time that is not in the future.');
      return;
    }

    const note = overrideNote.trim() || 'Manual override';
    try {
      if (overrideAction === 'clock_in') {
        manualClockIn(
          overrideRecord.staff,
          selectedDateKey,
          overrideTime,
          note,
        );
      } else {
        manualClockOut(
          overrideRecord.staff,
          selectedDateKey,
          overrideTime,
          note,
        );
      }
      const staffName = overrideRecord.staff.fullName;
      setOverrideRecord(null);
      setRecords(getAttendanceWithStaffForDate(selectedDateKey));
      setAvailableDates(new Set(getAttendanceDateKeys()));
      alert({
        tone: 'success',
        title: 'Attendance updated',
        message: `${staffName} — ${
          overrideAction === 'clock_in' ? 'clock-in' : 'clock-out'
        } saved at ${formatTime12h(at)}.\n\nFlagged as a manual override in the export.`,
        buttonLabel: 'Done',
      });
    } catch (error) {
      setOverrideError(
        error instanceof Error ? error.message : 'Could not save the override.',
      );
    }
  };

  const matchesFilter = (record: AttendanceWithStaffRow): boolean => {
    const log = record.log;
    switch (filter) {
      case 'all':
        return true;
      case 'present':
        return !!log && log.clockInStatus === 'on_time';
      case 'late':
        return !!log && log.clockInStatus === 'late';
      case 'clockedOut':
        return !!log && !!log.clockOutTime;
      case 'earlyExit':
        return !!log && !!log.clockOutTime && log.clockOutStatus === 'early';
      case 'absent':
        return !log;
      default:
        return true;
    }
  };

  const filteredRecords = useMemo(
    () => records.filter(matchesFilter),
    [records, filter],
  );

  const filterCounts = useMemo(() => {
    const counts: Record<AttendanceFilter, number> = {
      all: records.length,
      present: 0,
      late: 0,
      clockedOut: 0,
      earlyExit: 0,
      absent: 0,
    };
    for (const record of records) {
      const log = record.log;
      if (!log) {
        counts.absent += 1;
      } else {
        if (log.clockInStatus === 'on_time') counts.present += 1;
        if (log.clockInStatus === 'late') counts.late += 1;
        if (log.clockOutTime) counts.clockedOut += 1;
        if (log.clockOutTime && log.clockOutStatus === 'early')
          counts.earlyExit += 1;
      }
    }
    return counts;
  }, [records]);

  const summary = formatStatusSummary(records);

  useEffect(() => {
    if (routeFilter) {
      setFilter(routeFilter);
    }
  }, [routeFilter]);

  return (
    <Screen>
      <View style={styles.topArea}>
        <Card>
          <View style={styles.topHeader}>
            <View style={styles.topHeaderText}>
              <Text style={styles.eyebrow}>Attendance history</Text>
              <Text style={styles.recordSummary}>{summary}</Text>
            </View>
            <AppButton
              title="Export"
              size="sm"
              fullWidth={false}
              disabled={records.length === 0}
              onPress={() => setExportVisible(true)}
              icon={
                <Ionicons
                  name="download-outline"
                  size={16}
                  color={colors.white}
                />
              }
              style={styles.exportButton}
            />
          </View>

          <View style={styles.dateNavRow}>
            <Pressable
              onPress={() => shiftDay(-1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              style={({ pressed }) => [
                styles.dayNavButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={colors.primary}
              />
            </Pressable>

            <Pressable
              onPress={openCalendar}
              accessibilityRole="button"
              accessibilityLabel="Choose a date"
              style={({ pressed }) => [
                styles.dateCenter,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dateTitle}>
                {formatDateLong(selectedDate)}
              </Text>
              <Text style={styles.dateHint}>Tap to pick a date</Text>
            </Pressable>

            <Pressable
              onPress={() => shiftDay(1)}
              disabled={isToday}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: isToday }}
              style={({ pressed }) => [
                styles.dayNavButton,
                isToday && styles.dayNavButtonDisabled,
                pressed && !isToday && styles.pressed,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isToday ? colors.slate300 : colors.primary}
              />
            </Pressable>
          </View>
        </Card>
      </View>

      <View style={styles.filterRow}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'present', label: 'On time' },
              { key: 'late', label: 'Late' },
              { key: 'clockedOut', label: 'Clocked out' },
              { key: 'earlyExit', label: 'Early exit' },
              { key: 'absent', label: 'Absent' },
            ] as { key: AttendanceFilter; label: string }[]
          ).map((item, index) => (
            <QuickChip
              key={item.key}
              label={`${item.label} (${filterCounts[item.key]})`}
              active={filter === item.key}
              onPress={() => setFilter(item.key)}
              onLayout={handleChipLayout(index)}
            />
          ))}
        </ScrollView>
      </View>

      {records.length === 0 ? (
        <Card padded={false} style={[styles.listCard, styles.emptyCard]}>
          <EmptyState
            icon="calendar-outline"
            title="No staff for this date"
            message={`No staff were registered on ${formatDateMedium(
              selectedDateKey,
            )}. Use the date bar above to pick another day, or add staff first.`}
          />
        </Card>
      ) : filteredRecords.length === 0 ? (
        <Card padded={false} style={[styles.listCard, styles.emptyCard]}>
          <EmptyState
            icon="filter-outline"
            title="No records match"
            message={`No ${filter.toLowerCase()} records for ${formatDateMedium(
              selectedDateKey,
            )}.`}
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.listCard}>
          <FlatList
            data={filteredRecords}
            keyExtractor={(item) =>
              item.log ? `log-${item.log.id}` : `staff-${item.staff.id}`
            }
            renderItem={({ item }) => (
              <AttendanceRecordRow record={item} onOverride={openOverride} />
            )}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </Card>
      )}

      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.calendarCard} padded={false}>
            <View style={styles.calendarHeader}>
              <View style={styles.calendarNavGroup}>
                <Pressable
                  onPress={() => shiftCalendarMonth(-12)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  style={({ pressed }) => [
                    styles.calendarNavButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.yearArrow}>«</Text>
                </Pressable>
                <Pressable
                  onPress={() => shiftCalendarMonth(-1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  style={({ pressed }) => [
                    styles.calendarNavButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.primary}
                  />
                </Pressable>
              </View>

              <Text style={styles.calendarTitle}>
                {monthLabel(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                )}
              </Text>

              <View style={styles.calendarNavGroup}>
                <Pressable
                  onPress={() => shiftCalendarMonth(1)}
                  disabled={nextMonthDisabled}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  accessibilityState={{ disabled: nextMonthDisabled }}
                  style={({ pressed }) => [
                    styles.calendarNavButton,
                    nextMonthDisabled && styles.calendarNavButtonDisabled,
                    pressed && !nextMonthDisabled && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={
                      nextMonthDisabled ? colors.slate300 : colors.primary
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={() => shiftCalendarMonth(12)}
                  disabled={nextYearDisabled}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  accessibilityState={{ disabled: nextYearDisabled }}
                  style={({ pressed }) => [
                    styles.calendarNavButton,
                    nextYearDisabled && styles.calendarNavButtonDisabled,
                    pressed && !nextYearDisabled && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.yearArrow,
                      nextYearDisabled && styles.yearArrowDisabled,
                    ]}
                  >
                    »
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, index) => (
                <Text
                  key={`${label}-${index}`}
                  style={styles.weekdayLabel}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return (
                    <View
                      key={`blank-${index}`}
                      style={styles.dayCell}
                    />
                  );
                }

                const isSelected = cell.dateKey === selectedDateKey;
                const isDayToday = cell.dateKey === today;
                const hasRecords = availableDates.has(cell.dateKey);
                const isFuture = cell.dateKey > today;

                return (
                  <View key={cell.dateKey} style={styles.dayCell}>
                    <Pressable
                      onPress={() => {
                        selectDate(cell.dateKey);
                        setCalendarVisible(false);
                      }}
                      disabled={isFuture}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${formatDateMedium(
                        cell.dateKey,
                      )}`}
                      accessibilityState={{
                        selected: isSelected,
                        disabled: isFuture,
                      }}
                      style={({ pressed }) => [
                        styles.dayButton,
                        isDayToday && styles.dayToday,
                        isSelected && styles.daySelected,
                        isFuture && styles.dayDisabled,
                        pressed && !isFuture && styles.dayPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayLabel,
                          isSelected && styles.dayLabelSelected,
                        ]}
                      >
                        {cell.day}
                      </Text>
                      <View
                        style={[
                          styles.dayDot,
                          hasRecords && styles.dayDotVisible,
                          isSelected && styles.dayDotSelected,
                        ]}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.calendarLegend}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>
                Days with recorded attendance
              </Text>
            </View>

            <View style={styles.calendarFooter}>
              <AppButton
                title="Today"
                variant="secondary"
                size="sm"
                fullWidth={false}
                haptic={false}
                onPress={() => {
                  selectDate(today);
                  setCalendarVisible(false);
                }}
                style={styles.calendarFooterButton}
              />
              <AppButton
                title="Close"
                variant="ghost"
                size="sm"
                fullWidth={false}
                haptic={false}
                onPress={() => setCalendarVisible(false)}
                style={styles.calendarFooterButton}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={exportVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!exporting) {
            setExportVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.exportCard}>
            <View style={styles.exportHeader}>
              <View style={styles.exportHeaderText}>
                <Text style={styles.exportTitle}>Export attendance</Text>
                <Text style={styles.exportSubtitle}>
                  {formatDateLong(selectedDate)}
                </Text>
              </View>
              <Pressable
                onPress={() => setExportVisible(false)}
                disabled={exporting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close export dialog"
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && !exporting && styles.pressed,
                  exporting && styles.closeButtonDisabled,
                ]}
              >
                <Ionicons name="close" size={22} color={colors.slate500} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>File format</Text>
            <View style={styles.formatList}>
              {(['xlsx', 'csv'] as const).map((format) => {
                const active = exportFormat === format;
                return (
                  <Pressable
                    key={format}
                    onPress={() => setExportFormat(format)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.formatOption,
                      active && styles.formatOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={
                        format === 'xlsx'
                          ? 'grid-outline'
                          : 'document-text-outline'
                      }
                      size={20}
                      color={active ? colors.primary : colors.slate500}
                    />
                    <View style={styles.formatText}>
                      <Text
                        style={[
                          styles.formatTitle,
                          active && styles.formatTitleActive,
                        ]}
                      >
                        {format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}
                      </Text>
                      <Text style={styles.formatHint}>
                        {format === 'xlsx'
                          ? 'Attendance records plus daily totals'
                          : 'Plain text for any spreadsheet app'}
                      </Text>
                    </View>
                    <Ionicons
                      name={
                        active ? 'checkmark-circle' : 'ellipse-outline'
                      }
                      size={20}
                      color={active ? colors.primary : colors.slate300}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.exportPreview}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.infoDark}
              />
              <Text style={styles.exportPreviewText}>
                {records.length}{' '}
                {records.length === 1 ? 'record' : 'records'} from{' '}
                {formatDateMedium(selectedDateKey)} will be included.
              </Text>
            </View>

            <AppButton
              title={exporting ? 'Preparing…' : 'Export & share'}
              onPress={handleExport}
              loading={exporting}
              size="lg"
              icon={
                exporting ? undefined : (
                  <Ionicons
                    name="share-outline"
                    size={18}
                    color={colors.white}
                  />
                )
              }
              style={styles.exportAction}
            />
            <AppButton
              title="Cancel"
              variant="ghost"
              onPress={() => setExportVisible(false)}
              disabled={exporting}
              style={styles.cancelButton}
            />

            <Text style={styles.exportNote}>
              Generated on-device. Nothing is uploaded to a server.
            </Text>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={overrideRecord !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOverrideRecord(null)}
      >
        <KeyboardAvoidingView
          style={styles.overrideOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {overrideRecord ? (
            <Card style={styles.overrideCard} padded={false}>
              <ScrollView
                contentContainerStyle={styles.overrideContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.overrideHeader}>
                  <View style={styles.overrideHeaderText}>
                    <Text style={styles.overrideTitle}>Manual override</Text>
                    <Text style={styles.overrideSubtitle}>
                      {overrideRecord.staff.fullName}
                      {overrideRecord.staff.staffCode
                        ? ` · #${overrideRecord.staff.staffCode}`
                        : ''}
                    </Text>
                    <Text style={styles.overrideDate}>
                      {formatDateLong(selectedDate)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setOverrideRecord(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close manual override"
                    style={({ pressed }) => [
                      styles.closeButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="close"
                      size={22}
                      color={colors.slate500}
                    />
                  </Pressable>
                </View>

                <Text style={styles.fieldLabel}>What are you recording?</Text>
                <View style={styles.overrideToggle}>
                  {(['clock_in', 'clock_out'] as const).map((action) => {
                    const active = overrideAction === action;
                    const disabled =
                      action === 'clock_out' && !overrideRecord.log;
                    const log = overrideRecord.log;
                    const hint =
                      action === 'clock_in'
                        ? log
                          ? `Replace ${formatTime12h(log.clockInTime)}`
                          : 'Add arrival'
                        : log?.clockOutTime
                          ? `Update ${formatTime12h(log.clockOutTime)}`
                          : log
                            ? 'Add departure'
                            : 'Clock in first';
                    return (
                      <Pressable
                        key={action}
                        onPress={() => selectOverrideAction(action)}
                        disabled={disabled}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active, disabled }}
                        style={({ pressed }) => [
                          styles.overrideOption,
                          active && styles.overrideOptionActive,
                          disabled && styles.overrideOptionDisabled,
                          pressed && !disabled && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name={
                            action === 'clock_in'
                              ? 'log-in-outline'
                              : 'log-out-outline'
                          }
                          size={18}
                          color={
                            disabled
                              ? colors.slate300
                              : active
                                ? colors.primary
                                : colors.slate500
                          }
                        />
                        <View style={styles.overrideOptionText}>
                          <Text
                            style={[
                              styles.overrideOptionTitle,
                              active && styles.overrideOptionTitleActive,
                              disabled && styles.overrideOptionTitleDisabled,
                            ]}
                          >
                            {action === 'clock_in' ? 'Clock in' : 'Clock out'}
                          </Text>
                          <Text style={styles.overrideOptionHint}>{hint}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.overrideTimeField}>
                  <TimeField
                    label={
                      overrideAction === 'clock_in'
                        ? 'Clock-in time'
                        : 'Clock-out time'
                    }
                    value={overrideTime}
                    onChange={setOverrideTime}
                  />
                </View>

                <TextField
                  label="Reason / note"
                  value={overrideNote}
                  onChangeText={setOverrideNote}
                  placeholder="e.g. Camera glare / Manual override"
                  maxLength={80}
                  hint="Saved with this record and shown in exports."
                />

                <View style={styles.reasonRow}>
                  {OVERRIDE_REASONS.map((reason) => {
                    const active = overrideNote === reason;
                    return (
                      <Pressable
                        key={reason}
                        onPress={() => setOverrideNote(reason)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.reasonChip,
                          active && styles.reasonChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reasonLabel,
                            active && styles.reasonLabelActive,
                          ]}
                        >
                          {reason}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {overrideError ? (
                  <Text style={styles.overrideError}>{overrideError}</Text>
                ) : null}

                <AppButton
                  title={
                    overrideAction === 'clock_in'
                      ? overrideRecord.log
                        ? 'Save clock-in'
                        : 'Clock in'
                      : overrideRecord.log?.clockOutTime
                        ? 'Save clock-out'
                        : 'Clock out'
                  }
                  onPress={handleSaveOverride}
                  size="lg"
                  icon={
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color={colors.white}
                    />
                  }
                  style={styles.overrideSave}
                />
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setOverrideRecord(null)}
                />

                <Text style={styles.overrideFootnote}>
                  This record will be flagged as a manual override in the
                  attendance list and in exported reports.
                </Text>
              </ScrollView>
            </Card>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
      <AdminBottomTabBar navigation={navigation} active="AttendanceHistory" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  topHeaderText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recordSummary: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.slate700,
    fontWeight: '600',
  },
  exportButton: {
    minWidth: 98,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dayNavButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayNavButtonDisabled: {
    backgroundColor: colors.slate50,
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.6,
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  dateTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  dateHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate700,
  },
  chipLabelActive: {
    color: colors.white,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  filterContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  listCard: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  emptyCard: {
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderLeftWidth: 4,
  },
  recordRowSuccess: {
    borderLeftColor: colors.success,
    backgroundColor: '#F8FFFC',
  },
  recordRowDanger: {
    borderLeftColor: colors.danger,
    backgroundColor: '#FFF8F8',
  },
  recordRowNeutral: {
    borderLeftColor: colors.slate300,
    backgroundColor: colors.surface,
  },
  recordBody: {
    flex: 1,
  },
  recordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recordName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
  },
  faceIcon: {
    marginLeft: spacing.xs,
  },
  recordCode: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.slate500,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  timeLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.slate400,
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.slate800,
    fontVariant: ['tabular-nums'],
  },
  timeValueDanger: {
    color: colors.danger,
  },
  timeValueMuted: {
    color: colors.slate400,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  statusSuccess: {
    color: colors.successDark,
  },
  statusDanger: {
    color: colors.danger,
  },
  statusAbsent: {
    color: colors.slate400,
  },
  manualText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.warningDark,
  },
  overrideLink: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  overrideText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overrideOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overrideCard: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '92%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  overrideContent: {
    padding: spacing.lg,
  },
  overrideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  overrideHeaderText: {
    flex: 1,
  },
  overrideTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  overrideSubtitle: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate700,
  },
  overrideDate: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  overrideToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  overrideOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  overrideOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoSoft,
  },
  overrideOptionDisabled: {
    opacity: 0.5,
  },
  overrideOptionText: {
    flex: 1,
  },
  overrideOptionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate800,
  },
  overrideOptionTitleActive: {
    color: colors.primary,
  },
  overrideOptionTitleDisabled: {
    color: colors.slate400,
  },
  overrideOptionHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  overrideTimeField: {
    marginTop: spacing.lg,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  reasonChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate100,
  },
  reasonChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  reasonLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.slate700,
  },
  reasonLabelActive: {
    color: colors.white,
  },
  overrideError: {
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  overrideSave: {
    marginTop: spacing.sm,
  },
  overrideFootnote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: colors.slate500,
    textAlign: 'center',
  },
  calendarCard: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    padding: spacing.lg,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  calendarNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calendarNavButtonDisabled: {
    opacity: 0.55,
  },
  yearArrow: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 22,
  },
  yearArrowDisabled: {
    color: colors.slate300,
  },
  calendarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.slate800,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  weekdayLabel: {
    width: DAY_CELL_WIDTH,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.slate500,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  dayCell: {
    width: DAY_CELL_WIDTH,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayButton: {
    width: '100%',
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  daySelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayDisabled: {
    opacity: 0.25,
  },
  dayPressed: {
    backgroundColor: colors.infoSoft,
  },
  dayLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.slate800,
  },
  dayLabelSelected: {
    color: colors.white,
    fontWeight: '800',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  dayDotVisible: {
    backgroundColor: colors.success,
  },
  dayDotSelected: {
    backgroundColor: colors.white,
  },
  calendarLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  calendarFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  calendarFooterButton: {
    flex: 1,
  },
  exportCard: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  exportHeaderText: {
    flex: 1,
  },
  exportTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  exportSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.slate500,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate100,
  },
  closeButtonDisabled: {
    opacity: 0.45,
  },
  fieldLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  formatList: {
    gap: spacing.sm,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  formatOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.infoSoft,
  },
  formatText: {
    flex: 1,
  },
  formatTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.slate800,
  },
  formatTitleActive: {
    color: colors.primary,
  },
  formatHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.slate500,
  },
  exportPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
  exportPreviewText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.infoDark,
    lineHeight: 18,
  },
  exportAction: {
    marginTop: spacing.lg,
  },
  cancelButton: {
    marginTop: spacing.sm,
  },
  exportNote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.slate500,
    textAlign: 'center',
  },
});
