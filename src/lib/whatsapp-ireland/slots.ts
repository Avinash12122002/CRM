import { Db } from "mongodb";
import { WeekendSlot, WeekdayOption } from "./types";
import {
  convertIstSlotToCandidateTime,
  extractShortTimezone,
  formatDateInZone,
} from "./timezone";

/**
 * Returns upcoming weekday days (Mon–Fri only, skipping Sat/Sun) relative
 * to the current IST time.  Defaults to 5 weekdays.
 *
 * If today is a weekday AND the last slot (19:00 IST) has already started,
 * today is skipped.
 */
export function getUpcomingWeekdays(count: number = 5): WeekdayOption[] {
  const now = new Date();
  const todayISTStr = formatDateInZone(now, "Asia/Kolkata");

  const currentHourIST = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10
  );
  // Last slot starts at 19:00 — if at or past 19 today is over
  const isPastLastSlotToday = currentHourIST >= 19;

  const weekdays: WeekdayOption[] = [];
  let checkDate = new Date(`${todayISTStr}T12:00:00+05:30`);

  if (isPastLastSlotToday) {
    checkDate = new Date(checkDate.getTime() + 86400000);
  }

  const DAY_NAMES: Record<number, WeekdayOption["dayName"]> = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
  };

  while (weekdays.length < count) {
    const dayOfWeek = checkDate.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateISO = formatDateInZone(checkDate, "Asia/Kolkata");
      const displayLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(checkDate);

      weekdays.push({
        date: dateISO,
        dayName: DAY_NAMES[dayOfWeek],
        displayLabel,
      });
    }
    checkDate = new Date(checkDate.getTime() + 86400000);
  }

  return weekdays;
}

/**
 * Scans upcoming weekdays (Mon–Fri, after a given date) to find the next
 * weekday that has at least one available slot.
 */
export async function findNextAvailableWeekday(params: {
  db: Db;
  afterDate?: string;
  candidateTimeZone: string;
  candidateTimeLabel: string;
}): Promise<{ dayOption: WeekdayOption; availableSlots: WeekendSlot[] } | null> {
  const { db, afterDate, candidateTimeZone, candidateTimeLabel } = params;
  const allWeekdays = getUpcomingWeekdays(10);

  for (const day of allWeekdays) {
    if (afterDate && day.date <= afterDate) {
      continue;
    }
    const slots = await getAvailableWeekdaySlots({
      db,
      meetingDate: day.date,
      candidateTimeZone,
      candidateTimeLabel,
    });
    const available = slots.filter((s) => s.available);
    if (available.length > 0) {
      return { dayOption: day, availableSlots: available };
    }
  }

  return null;
}

/**
 * Generates all 1-hour consultation slots between 12:00 PM and 08:00 PM IST
 * for a specific weekday date (8 slots), checked against booked Ireland
 * meetings in MongoDB.
 */
export async function getAvailableWeekdaySlots(params: {
  db: Db;
  meetingDate: string; // YYYY-MM-DD
  candidateTimeZone: string;
  candidateTimeLabel: string;
  meetingUserId?: number;
}): Promise<WeekendSlot[]> {
  const { db, meetingDate, candidateTimeZone, candidateTimeLabel } = params;

  // Look up Pearl (WM role) so her CRM-booked meetings are also checked
  const pearlUser = await db.collection("users").findOne({
    username: { $regex: /^pearl$/i },
  });
  const matchPearlIds = pearlUser ? [pearlUser.id, String(pearlUser.id)] : [];

  // 1. Fetch already booked slots for this date (shared meetingSlots collection)
  const bookedSlots = await db
    .collection("meetingSlots")
    .find({
      meetingDate,
      $or: [
        { channel: "WhatsApp Ireland" },
        ...(matchPearlIds.length > 0 ? [{ meetingUserId: { $in: matchPearlIds } }] : []),
      ],
      status: { $in: ["scheduled", "completed"] },
    })
    .project({ _id: 0, startTime: 1, endTime: 1 })
    .toArray();

  const bookedIrelandSessions = await db
    .collection("whatsapp_ireland_sessions")
    .find({
      "bookedSlot.date": meetingDate,
      meetingStatus: { $in: ["booked", "rescheduled"] },
    })
    .project({ _id: 0, "bookedSlot.istTime": 1 })
    .toArray();

  const bookedSessionTimes = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookedIrelandSessions.map((s: any) => s.bookedSlot?.istTime).filter(Boolean)
  );

  const now = new Date();

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${meetingDate}T12:00:00+05:30`));

  const slots: WeekendSlot[] = [];

  // 8 slots: 12:00–20:00 IST (noon to 8 PM)
  const all8SlotTimes = [
    { start: "12:00", end: "13:00" },
    { start: "13:00", end: "14:00" },
    { start: "14:00", end: "15:00" },
    { start: "15:00", end: "16:00" },
    { start: "16:00", end: "17:00" },
    { start: "17:00", end: "18:00" },
    { start: "18:00", end: "19:00" },
    { start: "19:00", end: "20:00" },
  ];

  for (const item of all8SlotTimes) {
    const istStart = item.start;
    const istEnd = item.end;

    const slotDateTime = new Date(`${meetingDate}T${istStart}:00+05:30`);
    const isPastSlot = slotDateTime.getTime() <= now.getTime();

    // Check overlap with any booked meeting in meetingSlots or sessions
    const isOverlapping =
      bookedSessionTimes.has(istStart) ||
      bookedSlots.some((b) => {
        const bStart = b.startTime;
        const bEnd = b.endTime || b.startTime;
        return istStart < bEnd && istEnd > bStart;
      });

    if (!isOverlapping && !isPastSlot) {
      const candStart = convertIstSlotToCandidateTime(
        meetingDate,
        istStart,
        candidateTimeZone,
      );
      const candEnd = convertIstSlotToCandidateTime(
        meetingDate,
        istEnd,
        candidateTimeZone,
      );

      const istDisplayLabel = `${new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(slotDateTime)} - ${new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(`${meetingDate}T${istEnd}:00+05:30`))} IST (internal)`;

      const candidateDisplayLabel = `${candStart.display12h} - ${candEnd.display12h} (${candidateTimeLabel})`;

      slots.push({
        date: meetingDate,
        dayLabel,
        istStartTime: istStart,
        istEndTime: istEnd,
        candidateDate: candStart.candidateDate,
        candidateStartTime: candStart.candidateTime,
        candidateEndTime: candEnd.candidateTime,
        candidateDisplayLabel,
        istDisplayLabel,
        available: true,
      });
    }
  }

  return slots;
}

/**
 * Formats all available slots for a day into a single complete overview
 * with all slots formatted in the candidate's local time.
 */
export function formatSlotsOverview(params: {
  slots: WeekendSlot[];
  dayLabel: string;
  candidateTimeZoneLabel: string;
  isIndia?: boolean;
}): string {
  const { slots, dayLabel, candidateTimeZoneLabel } = params;

  let text = `📅 *All Available Consultation Slots for ${dayLabel}*\n`;

  const rawTzShort = extractShortTimezone(candidateTimeZoneLabel);
  const tzShort = rawTzShort.replace(/\bIST\b/g, "").replace(/\(|\)/g, "").trim();
  const tzSuffix = tzShort ? ` ${tzShort}` : "";

  if (slots.length > 0) {
    const firstLocal = slots[0].candidateDisplayLabel.split(" - ")[0].trim();
    const lastPart = slots[slots.length - 1].candidateDisplayLabel.split(" - ")[1].split(" (")[0].trim();
    text += `(1-hour 1-on-1 sessions between ${firstLocal} - ${lastPart}${tzSuffix})\n\n`;
  } else {
    text += `(1-hour 1-on-1 sessions in your local time${tzSuffix ? ` — ${tzShort}` : ""})\n\n`;
  }

  slots.forEach((s, idx) => {
    const num = idx + 1;
    const candRange = s.candidateDisplayLabel.split(" (")[0].trim();
    text += `*${num}.* ${candRange}\n`;
  });

  text += `\n👉 Tap *Select Slot* below or reply with your slot number (*1* to *${slots.length}*).\n`;
  text += `🔄 Want a different date? Tap *Change Date*.`;
  return text;
}

// ─── Backward-compat aliases (used by stateMachine.ts via named imports) ─────

/** @deprecated Use getUpcomingWeekdays for Ireland. */
export const getUpcomingWeekendDays = getUpcomingWeekdays;

/** @deprecated Use findNextAvailableWeekday for Ireland. */
export const findNextAvailableWeekendDay = findNextAvailableWeekday;

/** @deprecated Use getAvailableWeekdaySlots for Ireland. */
export const getAvailableWeekendSlots = getAvailableWeekdaySlots;
