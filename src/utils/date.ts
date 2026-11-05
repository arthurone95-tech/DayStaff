/** Date/time helpers. All calculations are locale-based (device timezone). */

import type { TimeValue } from '../types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Local date key, e.g. `2026-11-05`. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Combine a local date key and an `HH:mm` time into a Date. */
export function combineDateAndTime(dateKey: string, time: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function parseTimeString(time: string): TimeValue {
  const [hours, minutes] = time.split(':').map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

export function timeStringToParts(time: string): TimeValue {
  return parseTimeString(time);
}

export function partsToTimeString({ hours, minutes }: TimeValue): string {
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function formatClockTime(time: string): string {
  const { hours, minutes } = parseTimeString(time);
  return formatDigitalParts(hours, minutes);
}

export function formatDigitalParts(hours: number, minutes: number): string {
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad2(displayHour)}:${pad2(minutes)} ${suffix}`;
}

/** 12-hour time from a Date or ISO string, e.g. `7:05 AM`. */
export function formatTime12h(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${pad2(minutes)} ${suffix}`;
}

/** 24-hour clock string from a Date, e.g. `07:05:32`. */
export function formatTime24h(value: Date): string {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(
    value.getSeconds(),
  )}`;
}

export function formatDateLong(value: Date = new Date()): string {
  return `${WEEKDAYS[value.getDay()]}, ${value.getDate()} ${
    MONTHS[value.getMonth()]
  } ${value.getFullYear()}`;
}

export function formatDateMedium(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

/** Inclusive range of local date keys for a calendar month. */
export function getMonthBounds(
  year: number,
  monthIndex: number,
): { startKey: string; endKey: string; label: string } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    label: monthLabel(year, monthIndex),
  };
}

/** Whole minutes between two instants (positive when `to` is after `from`). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

/** e.g. 14 -> "14 min", 75 -> "1 hr 15 min". */
export function formatDuration(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe < 60) {
    return `${safe} min`;
  }
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function monthOptions(count = 12, now: Date = new Date()): Array<{
  year: number;
  monthIndex: number;
  label: string;
}> {
  const options: Array<{ year: number; monthIndex: number; label: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    options.push({
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      label: monthLabel(date.getFullYear(), date.getMonth()),
    });
  }
  return options;
}
