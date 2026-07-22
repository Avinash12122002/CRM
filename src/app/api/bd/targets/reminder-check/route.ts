import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { createNotification } from "@/lib/notifications";
import { getAuthPayload, todayDateStr } from "@/lib/bd/helpers";
import {
  BD_COLLECTIONS,
  DATA_ENTRY_ROLES,
  DAILY_LEAD_TARGET,
  REMINDER_INTERVAL_MS,
} from "@/lib/bd/constants";

// Called by the Data Entry page every 2 hours while the tab is open.
// Throttled server-side via lastReminderAt so refreshing the page can't spam notifications.
export async function GET(req: NextRequest) {
  try {
    const payload = getAuthPayload(req);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!DATA_ENTRY_ROLES.includes(payload.role)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const date = todayDateStr();
    const { db } = await connectToDatabase();

    const target = await db
      .collection(BD_COLLECTIONS.dailyTargets)
      .findOne({ userId: payload.id, date });

    const totalCreated = target?.totalCreated || 0;

    if (totalCreated >= DAILY_LEAD_TARGET) {
      return NextResponse.json({ shouldNotify: false, remaining: 0 });
    }

    const now = Date.now();
    const lastReminderAt = target?.lastReminderAt
      ? new Date(target.lastReminderAt).getTime()
      : 0;

    const dueForReminder = now - lastReminderAt >= REMINDER_INTERVAL_MS;
    const remaining = DAILY_LEAD_TARGET - totalCreated;

    if (dueForReminder) {
      await createNotification({
        userId: payload.id,
        title: "Reminder",
        message: `You still have ${remaining} leads pending today.`,
        type: "bd_target_reminder",
        link: "/dashboard/data-entry",
      });

      await db.collection(BD_COLLECTIONS.dailyTargets).updateOne(
        { userId: payload.id, date },
        { $set: { lastReminderAt: new Date() } },
        { upsert: true }
      );
    }

    return NextResponse.json({ shouldNotify: dueForReminder, remaining });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
