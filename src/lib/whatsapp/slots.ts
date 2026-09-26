import { Db } from "mongodb";
import { WeekendSlot } from "./types";
import {
  convertIstSlotToCandidateTime,
  extractShortTimezone,
  formatDateInZone,
} from "./timezone";

export interface WeekendDayOption {
  date: string; // YYYY-MM-DD
  dayName: "Saturday" | "Sunday";
  displayLabel: string; // e.g. "Saturday, 26 Sep"
}

/**
 * Returns upcoming weekend days (Saturdays and Sundays) relative to the current IST time.
 * Defaults to 10 days (~1 full month of weekend days).
 * If today is Saturday or Sunday and it's already past 18:30 IST (the last slot), today is skipped.
 */
export function getUpcomingWeekendDays(count: number = 10): WeekendDayOption[] {
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
  const currentMinIST = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      minute: "numeric",
    }).format(now),
    10
  );
  const isPastLastSlotToday = currentHourIST >= 20;

  const weekendDays: WeekendDayOption[] = [];
  let checkDate = new Date(`${todayISTStr}T12:00:00+05:30`);

  if (isPastLastSlotToday) {
    checkDate = new Date(checkDate.getTime() + 86400000);
  }

  while (weekendDays.length < count) {
    const dayOfWeek = checkDate.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dateISO = formatDateInZone(checkDate, "Asia/Kolkata");
      const dayName: "Saturday" | "Sunday" =
        dayOfWeek === 6 ? "Saturday" : "Sunday";
      const displayLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(checkDate);

      weekendDays.push({
        date: dateISO,
        dayName,
        displayLabel,
      });
    }
    checkDate = new Date(checkDate.getTime() + 86400000);
  }

  return weekendDays;
}

/**
 * Scans upcoming weekend days (after a given date) to find the next weekend day that has at least one available slot.
 */
export async function findNextAvailableWeekendDay(params: {
  db: Db;
  afterDate?: string;
  candidateTimeZone: string;
  candidateTimeLabel: string;
}): Promise<{ dayOption: WeekendDayOption; availableSlots: WeekendSlot[] } | null> {
  const { db, afterDate, candidateTimeZone, candidateTimeLabel } = params;
  const allWeekends = getUpcomingWeekendDays(10);

  for (const day of allWeekends) {
    if (afterDate && day.date <= afterDate) {
      continue;
    }
    const slots = await getAvailableWeekendSlots({
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
 * Generates all 1-hour consultation slots strictly between 01:00 PM and 09:00 PM IST
 * for a specific date (8 slots per day), checked against booked meetings in MongoDB.
 * Hides any booked slots completely.
 */
export async function getAvailableWeekendSlots(params: {
  db: Db;
  meetingDate: string; // YYYY-MM-DD
  candidateTimeZone: string;
  candidateTimeLabel: string;
  meetingUserId?: number;
}): Promise<WeekendSlot[]> {
  const { db, meetingDate, candidateTimeZone, candidateTimeLabel } = params;

  // 1. Fetch already booked slots for this date
  const bookedSlots = await db
    .collection("meetingSlots")
    .find({
      meetingDate,
      status: { $in: ["scheduled", "completed"] },
    })
    .project({ _id: 0, startTime: 1 })
    .toArray();

  const bookedTimes = new Set(bookedSlots.map((s) => s.startTime));

  // Current time in IST to filter out past slots if booking for today
  const now = new Date();

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${meetingDate}T12:00:00+05:30`));

  const slots: WeekendSlot[] = [];

  // Strictly 1-hour intervals, exactly 8 meetings in a day (01:00 PM to 09:00 PM IST)
  // Converted to every candidate's country local time zone!
  const all8SlotTimes = [
    { start: "13:00", end: "14:00" },
    { start: "14:00", end: "15:00" },
    { start: "15:00", end: "16:00" },
    { start: "16:00", end: "17:00" },
    { start: "17:00", end: "18:00" },
    { start: "18:00", end: "19:00" },
    { start: "19:00", end: "20:00" },
    { start: "20:00", end: "21:00" },
  ];

  for (const item of all8SlotTimes) {
    const istStart = item.start;
    const istEnd = item.end;

    const slotDateTime = new Date(`${meetingDate}T${istStart}:00+05:30`);
    const isPastSlot = slotDateTime.getTime() <= now.getTime();
    const isBooked = bookedTimes.has(istStart);

    // If slot is booked or in the past, DO NOT SHOW IT!
    if (!isBooked && !isPastSlot) {
      // Convert start and end times to candidate's local timezone
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
      }).format(new Date(`${meetingDate}T${istEnd}:00+05:30`))} (IST)`;

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
 * with all 8 slots formatted in the candidate's country local time.
 */
export function formatSlotsOverview(params: {
  slots: WeekendSlot[];
  dayLabel: string;
  candidateTimeZoneLabel: string;
  isIndia: boolean;
}): string {
  const { slots, dayLabel, candidateTimeZoneLabel, isIndia } = params;

  let text = `📅 *All Available Consultation Slots for ${dayLabel}*\n`;

  const tzShort = extractShortTimezone(candidateTimeZoneLabel);

  // Dynamic candidate country local time range in header (e.g. 08:30 AM - 04:30 PM WAT, or 01:00 PM - 09:00 PM IST)
  if (slots.length > 0) {
    const firstLocal = isIndia
      ? "01:00 PM"
      : slots[0].candidateDisplayLabel.split(" - ")[0].trim();
    const lastPart = isIndia
      ? "09:00 PM"
      : slots[slots.length - 1].candidateDisplayLabel.split(" - ")[1].split(" (")[0].trim();
    text += `(1-hour 1-on-1 sessions between ${firstLocal} - ${lastPart} ${tzShort})\n\n`;
  } else {
    text += `(1-hour 1-on-1 sessions in your local time — ${tzShort})\n\n`;
  }

  slots.forEach((s, idx) => {
    const num = idx + 1;
    if (isIndia) {
      const istStart12h = convertIstSlotToCandidateTime(s.date, s.istStartTime, "Asia/Kolkata").display12h;
      const istEnd12h = convertIstSlotToCandidateTime(s.date, s.istEndTime, "Asia/Kolkata").display12h;
      text += `*${num}.* ${istStart12h} - ${istEnd12h}\n`;
    } else {
      const candRange = s.candidateDisplayLabel.split(" (")[0].trim(); // e.g. "06:30 AM - 07:30 AM"
      text += `*${num}.* ${candRange}\n`;
    }
  });

  text += `\n👉 Tap *Select Slot* below or reply with your slot number (*1* to *${slots.length}*).\n`;
  text += `🔄 Want a different date? Tap *Change Date*.`;
  return text;
}
