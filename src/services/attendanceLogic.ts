/**
 * Core attendance state engine.
 *
 * Rules (per the PRD):
 *  - No record today                -> Clock-In flow  (On time / Late)
 *  - Clock-in exists, no clock-out  -> Clock-Out flow (On time / Early)
 *  - Both exist                     -> "Already clocked out for today"
 */

import {
  getActiveStaff,
  getLogForStaffOnDate,
  getLogsForDate,
  getSchedule,
  insertClockIn,
  updateClockIn,
  updateClockOut,
} from '../database/queries';
import type {
  AttendanceAuthMethod,
  AttendanceEvaluation,
  AttendanceLog,
  AttendanceResult,
  DailySummary,
  DayStatus,
  DepartureEvaluation,
  Schedule,
  Staff,
} from '../types';
import { getAttendanceOverrideEditWindowDays } from './appSettings';

import {
  combineDateAndTime,
  formatDuration,
  formatTime12h,
  minutesBetween,
  toDateKey,
} from '../utils/date';

/** Evaluate an arrival against the configured start time + grace period. */
export function evaluateClockIn(
  now: Date,
  schedule: Schedule,
  dateKey: string = toDateKey(now),
): AttendanceEvaluation {
  const scheduledStart = combineDateAndTime(dateKey, schedule.startTime);
  const minutesSinceStart = minutesBetween(scheduledStart, now);
  const grace = Math.max(0, schedule.lateThresholdMinutes);
  const isLate = minutesSinceStart > grace;
  return {
    status: isLate ? 'late' : 'on_time',
    minutesLate: isLate ? minutesSinceStart - grace : 0,
    scheduledStart: scheduledStart.toISOString(),
  };
}

/** Evaluate a departure against the configured closing time. */
export function evaluateClockOut(
  now: Date,
  schedule: Schedule,
  dateKey: string = toDateKey(now),
): DepartureEvaluation {
  const scheduledEnd = combineDateAndTime(dateKey, schedule.endTime);
  const minutesBeforeEnd = minutesBetween(now, scheduledEnd);
  const isEarly = minutesBeforeEnd > 0;
  return {
    status: isEarly ? 'early' : 'on_time',
    minutesEarly: isEarly ? minutesBeforeEnd : 0,
    scheduledEnd: scheduledEnd.toISOString(),
  };
}

/** True when the current time is at or past the configured closing time. */
export function isAtOrAfterClosing(
  now: Date,
  schedule: Schedule,
  dateKey: string = toDateKey(now),
): boolean {
  const scheduledEnd = combineDateAndTime(dateKey, schedule.endTime);
  return now.getTime() >= scheduledEnd.getTime();
}

function completeClockOut(
  staff: Staff,
  existing: AttendanceLog,
  now: Date,
  schedule: Schedule,
  date: string,
  authMethod: AttendanceAuthMethod,
): AttendanceResult {
  const evaluation = evaluateClockOut(now, schedule, date);
  const log = updateClockOut({
    logId: existing.id,
    clockOutTime: now.toISOString(),
    status: evaluation.status,
    minutesEarly: evaluation.minutesEarly,
    authMethod,
  });

  const detail =
    evaluation.status === 'early'
      ? `Left ${formatDuration(evaluation.minutesEarly)} early`
      : 'On time';

  return {
    action: 'clock_out',
    staff,
    log,
    message:
      evaluation.status === 'early'
        ? 'Clocked out — early departure'
        : 'Clocked out — on time',
    detail,
  };
}

export function deriveDayStatus(log: AttendanceLog | null): DayStatus {
  if (!log) {
    return 'absent';
  }
  if (log.clockOutTime) {
    return log.clockOutStatus === 'early' ? 'early_exit' : 'clocked_out';
  }
  return log.clockInStatus === 'late' ? 'late' : 'on_time';
}

/**
 * Record a scan for a staff member. The action is inferred from today's log,
 * matching the documented state machine. Throws if the DB write fails.
 */
export function recordAttendance(
  staff: Staff,
  now: Date = new Date(),
  authMethod: AttendanceAuthMethod = 'FACE_BIOMETRIC',
): AttendanceResult {
  const date = toDateKey(now);
  const schedule = getSchedule();
  const existing = getLogForStaffOnDate(staff.id, date);

  if (!existing) {
    const evaluation = evaluateClockIn(now, schedule, date);
    const log = insertClockIn({
      staffId: staff.id,
      date,
      clockInTime: now.toISOString(),
      status: evaluation.status,
      minutesLate: evaluation.minutesLate,
      authMethod,
    });

    const detail =
      evaluation.status === 'late'
        ? `Signed in ${formatDuration(evaluation.minutesLate)} late`
        : 'On time';

    return {
      action: 'clock_in',
      staff,
      log,
      message:
        evaluation.status === 'late'
          ? 'Clocked in — late'
          : 'Clocked in — on time',
      detail,
    };
  }

  if (!existing.clockOutTime) {
    // During the shift an existing clock-in must not silently become a
    // clock-out. Show a status card instead so the staff member can choose to
    // leave early. At/after closing time, verification finalises the day.
    if (!isAtOrAfterClosing(now, schedule, date)) {
      return {
        action: 'already_signed_in',
        staff,
        log: existing,
        message: 'Already signed in',
        detail: `Signed in at ${formatTime12h(
          existing.clockInTime,
        )}. Sign out below when you leave.`,
      };
    }

    return completeClockOut(
      staff,
      existing,
      now,
      schedule,
      date,
      authMethod,
    );
  }

  return {
    action: 'already_completed',
    staff,
    log: existing,
    message: `Already clocked out for today at ${formatTime12h(
      existing.clockOutTime,
    )}`,
    detail: `Clocked in at ${formatTime12h(existing.clockInTime)}`,
  };
}

/**
 * Manually sign a staff member out (used by the "Already signed in" card).
 * Early departures are allowed and recorded as an early exit.
 */
export function clockOutStaff(
  staff: Staff,
  now: Date = new Date(),
  authMethod: AttendanceAuthMethod = 'FACE_BIOMETRIC',
): AttendanceResult {
  const date = toDateKey(now);
  const schedule = getSchedule();
  const existing = getLogForStaffOnDate(staff.id, date);

  if (!existing) {
    throw new Error('No clock-in has been recorded for today.');
  }

  if (existing.clockOutTime) {
    return {
      action: 'already_completed',
      staff,
      log: existing,
      message: `Already clocked out for today at ${formatTime12h(
        existing.clockOutTime,
      )}`,
      detail: `Clocked in at ${formatTime12h(existing.clockInTime)}`,
    };
  }

  return completeClockOut(staff, existing, now, schedule, date, authMethod);
}

/**
 * Admin override: add or correct a clock-in for a chosen date.
 *
 * The time is treated as a local wall-clock time on that date. If a log
 * already exists, only the arrival fields are replaced so a manual departure
 * (or any other profile/log data) is preserved.
 */
function assertEditableAttendanceDate(dateKey: string): void {
  const today = toDateKey(new Date());
  if (dateKey > today) {
    throw new Error('Cannot edit attendance for a future date.');
  }
  const todayDate = new Date(`${today}T00:00:00`).getTime();
  const selectedDate = new Date(`${dateKey}T00:00:00`).getTime();
  const diffDays = Math.round((todayDate - selectedDate) / 86400000);
  const windowDays = getAttendanceOverrideEditWindowDays();
  if (diffDays > windowDays - 1) {
    throw new Error(
      `This date is locked. Overrides are only allowed within the last ${windowDays} day(s).`,
    );
  }
}

export function manualClockIn(
  staff: Staff,
  dateKey: string,
  time: string,
  note: string | null,
): AttendanceLog {
  assertEditableAttendanceDate(dateKey);

  const existing = getLogForStaffOnDate(staff.id, dateKey);
  if (existing) {
    throw new Error(
      'This staff member already has a clock-in for this date; the original biometric scan is locked.',
    );
  }

  const at = combineDateAndTime(dateKey, time);
  const schedule = getSchedule();
  const evaluation = evaluateClockIn(at, schedule, dateKey);

  return insertClockIn({
    staffId: staff.id,
    date: dateKey,
    clockInTime: at.toISOString(),
    status: evaluation.status,
    minutesLate: evaluation.minutesLate,
    authMethod: 'MANUAL_OVERRIDE',
    isManualOverride: true,
    overrideNote: note,
    overrideRecordedAt: new Date().toISOString(),
  });
}

/** Admin override: add or correct a clock-out for a chosen date. */
export function manualClockOut(
  staff: Staff,
  dateKey: string,
  time: string,
  note: string | null,
): AttendanceLog {
  assertEditableAttendanceDate(dateKey);

  const existing = getLogForStaffOnDate(staff.id, dateKey);
  if (!existing) {
    throw new Error('Add a clock-in before adding a clock-out.');
  }
  if (existing.clockOutTime) {
    throw new Error(
      'This staff member already has a clock-out for this date; the original scan is locked.',
    );
  }

  const at = combineDateAndTime(dateKey, time);
  if (at.getTime() <= new Date(existing.clockInTime).getTime()) {
    throw new Error('Clock-out time must be after the clock-in time.');
  }

  const schedule = getSchedule();
  const evaluation = evaluateClockOut(at, schedule, dateKey);
  return updateClockOut({
    logId: existing.id,
    clockOutTime: at.toISOString(),
    status: evaluation.status,
    minutesEarly: evaluation.minutesEarly,
    authMethod: existing.authMethod,
    isManualOverride: true,
    overrideNote: note,
    overrideRecordedAt: new Date().toISOString(),
  });
}

/** Build the admin dashboard view for a given local date. */
export function buildDailySummary(date: string): DailySummary {
  const staff = getActiveStaff();
  const logs = getLogsForDate(date);
  const logByStaff = new Map<number, AttendanceLog>(
    logs.map((log) => [log.staffId, log]),
  );

  const records = staff.map((member) => {
    const log = logByStaff.get(member.id) ?? null;
    return { staff: member, log, status: deriveDayStatus(log) };
  });

  const count = (status: DayStatus) =>
    records.filter((record) => record.status === status).length;

  const withLog = records.filter((record) => record.log !== null);

  return {
    date,
    totalStaff: staff.length,
    // Arrival categories are mutually exclusive.
    present: withLog.filter(
      (record) => record.log?.clockInStatus === 'on_time',
    ).length,
    late: withLog.filter((record) => record.log?.clockInStatus === 'late')
      .length,
    absent: count('absent'),
    // Departure categories count everyone who has left, independently of
    // whether they arrived late.
    clockedOut: withLog.filter((record) => record.log?.clockOutTime).length,
    earlyExit: withLog.filter(
      (record) =>
        record.log?.clockOutTime &&
        record.log.clockOutStatus === 'early',
    ).length,
    records,
  };
}
