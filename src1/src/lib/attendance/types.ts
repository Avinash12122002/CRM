/**
 * Attendance Module — Type Definitions
 *
 * Self-contained; not imported by any existing lib file.
 * All attendance API routes and components reference this interface.
 */

export type AttendanceStatus = "present" | "absent" | "leave" | "half-day";
export type MarkedBy = "self" | "system" | "admin";

export interface AttendanceRecord {
  /** Auto-incremented integer ID from getNextId(db, "attendance") */
  id: number;

  /** FK → users.id  (never written back to users collection) */
  userId: number;

  /** Denormalized at write-time for fast admin table rendering */
  userName: string;

  /** Denormalized at write-time */
  role: string;

  /** "YYYY-MM-DD" in Asia/Kolkata timezone */
  date: string;

  status: AttendanceStatus;

  /** Who created / last modified this record */
  markedBy: MarkedBy;

  /** ISO string, set only when markedBy === "self" */
  checkInTime: string | null;

  /** Required when markedBy === "admin", optional otherwise */
  note: string | null;

  createdAt: string;
  updatedAt: string;
}
