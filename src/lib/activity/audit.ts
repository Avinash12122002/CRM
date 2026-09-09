import { Db } from "mongodb";
import { getNextId } from "@/lib/auth";

export const WFH_MONITORED_ROLES = [
  "telecaller",
  "case_manager",
  "business_development",
  "wcm",
  "wtc",
  "follow_up",
] as const;

export function isMonitoredRole(role?: string | null): boolean {
  if (!role) return false;
  return (WFH_MONITORED_ROLES as readonly string[]).includes(role);
}

export type ActionType =
  | "lead_created"
  | "lead_status_updated"
  | "lead_note_added"
  | "lead_sales_converted"
  | "convert_to_sales"
  | "data_entry_created"
  | "meeting_booked"
  | "meeting_completed"
  | "meeting_rescheduled"
  | "meeting_cancelled"
  | "meeting_cancel"
  | "lead_assigned"
  | "update_occupations"
  | "vacancy_created"
  | "announcement_created"
  | "reschedule_meeting"
  | "book_meeting"
  | "bd_lead_created"
  | "bd_stage_updated"
  | "bd_note_added"
  | "cm_source_created"
  | "cm_employer_added"
  | "cm_employer_status"
  | "cm_email_sent"
  | "add_marketing_sources"
  | "update_credentials"
  | "billing_invoice_created"
  | "billing_payment_recorded"
  | "record_payment"
  | "update_payment_amount"
  | "mark_paid"
  | "mark_unpaid"
  | "create_lead"
  | "update_lead_status"
  | "add_lead_note"
  | (string & {});

export type EntityType =
  | "lead"
  | "triloknath_lead"
  | "bd_lead"
  | "meeting"
  | "case_marketing"
  | "case_lead"
  | "invoice"
  | "billing"
  | (string & {});

export interface LogActionParams {
  userId: number;
  userName: string;
  userRole: string;
  actionType: ActionType;
  entityType: EntityType;
  entityId: number | string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export function getTodayIST(): string {
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  return `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Centrally records any tangible work action performed by a user across the CRM.
 * Also atomically increments the user's daily actions counter in the `activities` collection.
 */
export async function logUserAction(
  db: Db,
  params: LogActionParams
): Promise<void> {
  try {
    const now = new Date();
    const today = getTodayIST();
    const id = await getNextId(db, "user_action_logs");

    const logEntry = {
      id,
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary,
      metadata: params.metadata || {},
      date: today,
      timestamp: now,
    };

    // 1. Insert into persistent audit logs
    await db.collection("user_action_logs").insertOne(logEntry);

    // 2. Increment user's actionsToday and update lastActionAt in their daily activity record
    await db.collection("activities").updateMany(
      {
        userId: params.userId,
        date: today,
      },
      {
        $inc: { actionsToday: 1 },
        $set: {
          lastActionAt: now,
          isGhostAlert: false, // Clearing ghost alert whenever real work is performed
          workVerificationStatus: "verified",
          updatedAt: now,
        },
      }
    );
  } catch (error) {
    console.error("[logUserAction] Failed to log user action:", error);
    // Non-blocking: Do not crash the caller if audit log write encounters an issue
  }
}

/**
 * Retrieves a user's recent actions for a specific date (used for timeline drawers).
 */
export async function getUserActionsForDate(
  db: Db,
  userId: number,
  date: string,
  limit = 50
) {
  return await db
    .collection("user_action_logs")
    .find({ userId, date })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}
