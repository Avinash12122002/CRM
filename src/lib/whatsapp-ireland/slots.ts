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
  const isPastLastSlotToday = currentHourIST >= 21;

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
 * for a specific date (8 slots per day), checked against booked Ireland meetings in MongoDB.
 */
export async function getAvailableWeekendSlots(params: {
  db: Db;
  meetingDate: string; // YYYY-MM-DD
  candidateTimeZone: string;
  candidateTimeLabel: string;
  meetingUserId?: number;
}): Promise<WeekendSlot[]> {
  const { db, meetingDate, candidateTimeZone, candidateTimeLabel } = params;

  // 1. Fetch already booked slots for this date in Ireland sessions or general meetingSlots
  const bookedSlots = await db
    .collection("meetingSlots")
    .find({
      meetingDate,
      status: { $in: ["scheduled", "completed"] },
    })
    .project({ _id: 0, startTime: 1 })
    .toArray();

  const bookedIrelandSessions = await db
    .collection("whatsapp_ireland_sessions")
    .find({
      "bookedSlot.date": meetingDate,
      meetingStatus: { $in: ["booked", "rescheduled"] },
    })
    .project({ _id: 0, "bookedSlot.istTime": 1 })
    .toArray();

  const bookedTimes = new Set([
    ...bookedSlots.map((s) => s.startTime),
    ...bookedIrelandSessions.map((s: any) => s.bookedSlot?.istTime).filter(Boolean),
  ]);

  const now = new Date();

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${meetingDate}T12:00:00+05:30`));

  const slots: WeekendSlot[] = [];

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

    if (!isBooked && !isPastSlot) {
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
