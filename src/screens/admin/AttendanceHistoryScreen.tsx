import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import {
  getAttendanceDateKeys,
  getAttendanceWithStaffForDate,
  type AttendanceWithStaffRow,
} from '../../database/queries';
import { exportAttendanceReportForDate } from '../../services/exportService';
import { colors, fontSize, radius, spacing } from '../../theme';
import {
  addDaysToKey,
  formatDateLong,
  formatDateMedium,
  formatTime12h,
  monthLabel,
  parseDateKey,
  toDateKey,
  todayKey,
  yesterdayKey,
} from '../../utils/date';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_CELL_WIDTH = '14.2857%';

type ExportFormat = 'xlsx' | 'csv';

function QuickChip({
  label,
  active = false,
  icon,
  onPress,
}: {
  label: string;
  active?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
    return 'No records for this day';
  }
  let late = 0;
  let early = 0;
  for (const { log } of records) {
    if (log.clockInStatus === 'late') {
      late += 1;
    }
    if (log.clockOutStatus === 'early') {
      early += 1;
    }
  }
  const parts = [`${records.length} ${records.length === 1 ? 'record' : 'records'}`];
  if (late > 0) {
    parts.push(`${late} late`);
  }
  if (early > 0) {
    parts.push(`${early} early exit${early === 1 ? '' : 's'}`);
  }
  if (late === 0 && early === 0) {
    parts.push('no late or early exits');
  }
  return parts.join(' · ');
}

function AttendanceRecordRow({ record }: { record: AttendanceWithStaffRow }) {
  const { staff, log } = record;
  const isLate = log.clockInStatus === 'late';
  const isEarly = log.clockOutStatus === 'early';

  const arrivalBadge: { label: string; tone: BadgeTone } = isLate
    ? { label: `Late ${log.minutesLate}m`, tone: 'danger' }
    : { label: 'On time', tone: 'success' };

  const departureBadge: { label: string; tone: BadgeTone } = log.clockOutTime
    ? isEarly
      ? { label: `Early ${log.minutesEarly}m`, tone: 'danger' }
      : { label: 'Clocked out', tone: 'success' }
    : { label: 'No clock-out', tone: 'neutral' };

  const clockOut = log.clockOutTime
    ? formatTime12h(log.clockOutTime)
    : 'Not recorded';
  const rowToneStyle =
    isLate || isEarly
      ? styles.recordRowDanger
      : log.clockOutTime
        ? styles.recordRowSuccess
        : styles.recordRowNeutral;

  return (
    <View
      accessible
      accessibilityLabel={`${staff.fullName}, clocked in ${formatTime12h(
        log.clockInTime,
      )}, clocked out ${clockOut}, ${arrivalBadge.label}, ${
        departureBadge.label
      }`}
      style={[styles.recordRow, rowToneStyle]}
    >
      <Avatar name={staff.fullName} photoUri={staff.photoUri} size={46} />

      <View style={styles.recordBody}>
        <View style={styles.recordTitleRow}>
          <Text style={styles.recordName} numberOfLines={1}>
            {staff.fullName}
          </Text>
          <Text style={styles.recordCode}>
            {staff.staffCode ? `#${staff.staffCode}` : 'No code'}
          </Text>
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>IN</Text>
            <Text style={[styles.timeValue, isLate && styles.timeValueDanger]}>
              {formatTime12h(log.clockInTime)}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={13} color={colors.slate400} />
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>OUT</Text>
            <Text
              style={[
                styles.timeValue,
                isEarly && styles.timeValueDanger,
                !log.clockOutTime && styles.timeValueMuted,
              ]}
            >
              {log.clockOutTime ? formatTime12h(log.clockOutTime) : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.badges}>
          <Badge label={arrivalBadge.label} tone={arrivalBadge.tone} />
          <Badge label={departureBadge.label} tone={departureBadge.tone} />
        </View>
      </View>
    </View>
  );
}

export function AttendanceHistoryScreen() {
  const today = todayKey();
  const yesterday = yesterdayKey();

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
      Alert.alert(
        'Report ready',
        `${result.rowCount} ${noun} included.\n\n${
          result.shared
            ? 'The native share sheet is open — send it via WhatsApp, email or Files.'
            : `Sharing is unavailable, so the file was saved to:\n${result.uri}`
        }`,
      );
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  const summary = formatStatusSummary(records);

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

          <View style={styles.quickRow}>
            <QuickChip
              label="Today"
              active={selectedDateKey === today}
              onPress={() => selectDate(today)}
            />
            <QuickChip
              label="Yesterday"
              active={selectedDateKey === yesterday}
              onPress={() => selectDate(yesterday)}
            />
            <QuickChip
              label="Pick date"
              icon="calendar-outline"
              onPress={openCalendar}
            />
          </View>
        </Card>
      </View>

      {records.length === 0 ? (
        <Card padded={false} style={[styles.listCard, styles.emptyCard]}>
          <EmptyState
            icon="calendar-outline"
            title="No attendance records found"
            message={`No staff clocked in on ${formatDateMedium(
              selectedDateKey,
            )}. Try another date.`}
            actionLabel="Pick another date"
            onAction={openCalendar}
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.listCard}>
          <FlatList
            data={records}
            keyExtractor={(item) => String(item.log.id)}
            renderItem={({ item }) => <AttendanceRecordRow record={item} />}
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
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
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
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
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
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  recordName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.slate900,
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
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  timeLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.slate400,
    letterSpacing: 0.6,
  },
  timeValue: {
    fontSize: fontSize.sm,
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
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
