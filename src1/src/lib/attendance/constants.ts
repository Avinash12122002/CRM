/**
 * Attendance Module — Constants
 *
 * Centralises all magic values so they're easy to change without hunting
 * through route files. No imports from existing lib files needed here.
 */

import type { AttendanceStatus } from "./types";

/** All valid attendance statuses */
export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "leave",
  "half-day",
];

/** Statuses an employee is allowed to self-mark (cannot self-mark "absent") */
export const SELF_MARK_STATUSES: AttendanceStatus[] = [
  "present",
  "half-day",
  "leave",
];

/** MongoDB collection name — isolated, never conflicts with existing collections */
export const ATTENDANCE_COLLECTION = "attendance";

/**
 * The hour (in IST, 0-23) after which self-marking is no longer allowed for
 * the current day. Set to 23 so employees can mark until 23:59 IST.
 */
export const MARK_CUTOFF_HOUR = 23;

/** Status display config for badge rendering */
export const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; bgColor: string; emoji: string }
> = {
  present: {
    label: "Present",
    emoji: "✅",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  absent: {
    label: "Absent",
    emoji: "❌",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  leave: {
    label: "Leave",
    emoji: "🏖️",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  "half-day": {
    label: "Half Day",
    emoji: "⚡",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
  },
};
