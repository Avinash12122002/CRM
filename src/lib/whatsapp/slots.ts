import { Db } from "mongodb";
import { WeekendSlot } from "./types";
import {
  convertIstSlotToCandidateTime,
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
  const isPastLastSlotToday =
    currentHourIST > 18 || (currentHourIST === 18 && currentMinIST >= 30);

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
 * Generates all 30-minute consultation slots strictly between 11:00 AM and 07:00 PM IST
 * for a specific date, checked against booked meetings in MongoDB.
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

  // 10 evenly spaced 30-minute consultation slots strictly between 11:00 AM and 07:00 PM IST
  // Allows every slot to fit into a single Meta WhatsApp interactive list message with the "Select Slot" button!
  const fixedSlotTimes = [
    { start: "11:00", end: "11:30" },
    { start: "11:45", end: "12:15" },
    { start: "12:30", end: "13:00" },
    { start: "13:15", end: "13:45" },
    { start: "14:00", end: "14:30" },
    { start: "14:45", end: "15:15" },
    { start: "15:30", end: "16:00" },
    { start: "16:15", end: "16:45" },
    { start: "17:00", end: "17:30" },
    { start: "18:00", end: "18:30" },
  ];

  for (const item of fixedSlotTimes) {
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
 * so the candidate can see all 16 slots at once in one view.
 */
export function formatSlotsOverview(params: {
  slots: WeekendSlot[];
  dayLabel: string;
  candidateTimeZoneLabel: string;
  isIndia: boolean;
}): string {
  const { slots, dayLabel, candidateTimeZoneLabel, isIndia } = params;

  let text = `📅 *All Available Consultation Slots for ${dayLabel}*\n`;
  if (isIndia) {
    text += `(30-minute 1-on-1 sessions between 11:00 AM - 07:00 PM IST)\n\n`;
  } else {
    text += `(30-minute 1-on-1 sessions in your local time — ${candidateTimeZoneLabel})\n\n`;
  }

  slots.forEach((s, idx) => {
    const num = idx + 1;
    if (isIndia) {
      text += `*${num}.* ${s.istStartTime} - ${s.istEndTime} IST\n`;
    } else {
      // ONLY candidate local time is displayed - zero IST confusion!
      const candRange = s.candidateDisplayLabel.split(" (")[0]; // e.g. "06:30 AM - 07:00 AM"
      text += `*${num}.* ${candRange} (${candidateTimeZoneLabel})\n`;
    }
  });

  text += `\n👉 Tap *Select Slot* below to choose, or reply with your slot number (*1* to *${slots.length}*) or time.\n`;
  text += `🔄 Want a different date? Reply *Change Date*.`;
  return text;
}
