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
  updateClockOut,
} from '../database/queries';
import type {
  AttendanceEvaluation,
  AttendanceLog,
  AttendanceResult,
  DailySummary,
  DayStatus,
  DepartureEvaluation,
  Schedule,
  Staff,
} from '../types';
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
    const evaluation = evaluateClockOut(now, schedule, date);
    const log = updateClockOut({
      logId: existing.id,
      clockOutTime: now.toISOString(),
      status: evaluation.status,
      minutesEarly: evaluation.minutesEarly,
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
