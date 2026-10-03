import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { createNotification } from "@/lib/notifications";
import { todayDateStr } from "@/lib/bd/helpers";
import {
  BD_COLLECTIONS,
  DATA_ENTRY_ROLES,
  DAILY_LEAD_TARGET,
} from "@/lib/bd/constants";

// Intended to be triggered by an external scheduler (Render Cron Job / GitHub
// Actions scheduled workflow) every 2 hours, since Next.js on Render has no
// built-in background job runner. Protect with CRON_SECRET env var.
//
// Example Render cron command:
//   curl -X POST https://your-app.onrender.com/api/bd/targets/broadcast-reminders \
//     -H "x-cron-secret: $CRON_SECRET"
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-cron-secret");
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const date = todayDateStr();

    const dataEntryUsers = await db
      .collection("users")
      .find({ role: { $in: DATA_ENTRY_ROLES } })
      .project({ id: 1, name: 1 })
      .toArray();

    let notified = 0;

    for (const user of dataEntryUsers) {
      const target = await db
        .collection(BD_COLLECTIONS.dailyTargets)
        .findOne({ userId: user.id, date });

      const totalCreated = target?.totalCreated || 0;
      if (totalCreated >= DAILY_LEAD_TARGET) continue;

      const remaining = DAILY_LEAD_TARGET - totalCreated;

      await createNotification({
        userId: user.id,
        title: "Reminder",
        message: `You still have ${remaining} leads pending today.`,
        type: "bd_target_reminder",
        link: "/dashboard/data-entry",
      });

      await db.collection(BD_COLLECTIONS.dailyTargets).updateOne(
        { userId: user.id, date },
        {
          $set: { lastReminderAt: new Date() },
          $setOnInsert: { userId: user.id, userName: user.name, date, totalCreated: 0, targetCompleted: false },
        },
        { upsert: true }
      );

      notified += 1;
    }

    return NextResponse.json({ message: "Reminders processed", notified, date });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
