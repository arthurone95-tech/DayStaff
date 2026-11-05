/**
 * Report generation and sharing.
 *
 * Produces real `.xlsx` workbooks (SheetJS) and CSV files, then hands the
 * file to the OS share sheet (WhatsApp, email, Files, etc.).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import {
  getActiveStaff,
  getExportLogs,
  getSchedule,
  getSetting,
  type ExportLogRow,
} from '../database/queries';
import type { ExportRange } from '../types';
import {
  formatDateMedium,
  formatDuration,
  formatTime12h,
  getMonthBounds,
  todayKey,
} from '../utils/date';
import { deriveDayStatus } from './attendanceLogic';
import { SCHOOL_NAME_SETTING, DEFAULT_SCHOOL_NAME } from '../database/seed';

export interface ExportOptions {
  range: ExportRange;
  year: number;
  monthIndex: number;
  format: 'xlsx' | 'csv';
}

export interface ExportResult {
  uri: string;
  fileName: string;
  rowCount: number;
  shared: boolean;
}

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
} as const;

function resolveBounds(
  options: ExportOptions,
): { startDate: string; endDate: string; label: string } {
  if (options.range === 'today') {
    const key = todayKey();
    return { startDate: key, endDate: key, label: `Today ${formatDateMedium(key)}` };
  }
  if (options.range === 'month') {
    const bounds = getMonthBounds(options.year, options.monthIndex);
    return {
      startDate: bounds.startKey,
      endDate: bounds.endKey,
      label: bounds.label,
    };
  }
  return {
    startDate: '0000-01-01',
    endDate: '9999-12-31',
    label: 'All records',
  };
}

function statusLabel(row: ExportLogRow): string {
  const status = deriveDayStatus(row.log);
  switch (status) {
    case 'on_time':
      return 'Present (on time)';
    case 'late':
      return 'Late';
    case 'clocked_out':
      return 'Clocked out';
    case 'early_exit':
      return 'Early exit';
    default:
      return 'Absent';
  }
}

function buildRows(rows: ExportLogRow[]): (string | number)[][] {
  return rows.map((row) => {
    const { log } = row;
    const onSiteMinutes =
      log.clockOutTime
        ? Math.max(
            0,
            Math.round(
              (new Date(log.clockOutTime).getTime() -
                new Date(log.clockInTime).getTime()) /
                60000,
            ),
          )
        : '';

    return [
      log.date,
      row.staffName,
      row.phoneNumber,
      formatTime12h(log.clockInTime),
      log.clockInStatus === 'late' ? 'Late' : 'On time',
      log.minutesLate,
      log.clockOutTime ? formatTime12h(log.clockOutTime) : '',
      log.clockOutStatus
        ? log.clockOutStatus === 'early'
          ? 'Early'
          : 'On time'
        : '',
      log.minutesEarly,
      statusLabel(row),
      onSiteMinutes,
    ];
  });
}

const HEADERS = [
  'Date',
  'Staff name',
  'Phone',
  'Clock in',
  'Clock-in status',
  'Minutes late',
  'Clock out',
  'Clock-out status',
  'Minutes early',
  'Day status',
  'Minutes on site',
];

function buildDailyTotals(
  rows: ExportLogRow[],
): (string | number)[][] {
  const byDate = new Map<
    string,
    { present: number; late: number; clockedOut: number; earlyExit: number }
  >();

  for (const row of rows) {
    const bucket =
      byDate.get(row.log.date) ??
      { present: 0, late: 0, clockedOut: 0, earlyExit: 0 };
    const status = deriveDayStatus(row.log);
    if (status === 'on_time') bucket.present += 1;
    if (status === 'late') bucket.late += 1;
    if (status === 'clocked_out') bucket.clockedOut += 1;
    if (status === 'early_exit') bucket.earlyExit += 1;
    byDate.set(row.log.date, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => [
      date,
      counts.present,
      counts.late,
      counts.clockedOut,
      counts.earlyExit,
    ]);
}

function buildWorkbook(
  rows: ExportLogRow[],
  label: string,
): XLSX.WorkBook {
  const schoolName =
    getSetting(SCHOOL_NAME_SETTING) ?? DEFAULT_SCHOOL_NAME;
  const schedule = getSchedule();
  const staff = getActiveStaff();

  const meta = [
    ['DayStaff Attendance Report'],
    ['School', schoolName],
    ['Range', label],
    ['Generated', new Date().toLocaleString()],
    ['Registered staff', staff.length],
    [
      'Official hours',
      `${schedule.startTime} – ${schedule.endTime} (grace ${schedule.lateThresholdMinutes} min)`,
    ],
    [],
  ];

  const attendanceSheet = XLSX.utils.aoa_to_sheet([
    ...meta,
    HEADERS,
    ...buildRows(rows),
  ]);
  attendanceSheet['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 13 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
    { wch: 15 },
  ];

  const dailySheet = XLSX.utils.aoa_to_sheet([
    ['Date', 'Present (on time)', 'Late', 'Clocked out', 'Early exit'],
    ...buildDailyTotals(rows),
  ]);
  dailySheet['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, attendanceSheet, 'Attendance');
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily totals');
  return workbook;
}

async function shareFile(
  uri: string,
  format: 'xlsx' | 'csv',
): Promise<boolean> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return false;
  }
  await Sharing.shareAsync(uri, {
    mimeType: MIME[format],
    dialogTitle: 'Share DayStaff attendance report',
    UTI:
      format === 'xlsx'
        ? 'org.openxmlformats.spreadsheetml.sheet'
        : 'public.comma-separated-values-text',
  });
  return true;
}

export async function exportAttendanceReport(
  options: ExportOptions,
): Promise<ExportResult> {
  const { startDate, endDate, label } = resolveBounds(options);
  const rows = getExportLogs(startDate, endDate);
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const fileName = `DayStaff-${safeLabel}.${options.format}`;
  const uri = `${FileSystem.cacheDirectory}${fileName}`;

  if (options.format === 'csv') {
    const table = [HEADERS, ...buildRows(rows)];
    const sheet = XLSX.utils.aoa_to_sheet(table);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } else {
    const workbook = buildWorkbook(rows, label);
    const base64 = XLSX.write(workbook, {
      type: 'base64',
      bookType: 'xlsx',
    });
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const shared = await shareFile(uri, options.format);
  return { uri, fileName, rowCount: rows.length, shared };
}

export function describeRangeLabel(
  range: ExportRange,
  year: number,
  monthIndex: number,
): string {
  return resolveBounds({ range, year, monthIndex, format: 'xlsx' }).label;
}

export function formatMinutes(value: number): string {
  return formatDuration(value);
}
