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
 * Returns upcoming Saturday and Sunday relative to the current IST time
 */
export function getUpcomingWeekendDays(): WeekendDayOption[] {
  // Current time in IST
  const now = new Date();
  const todayISTStr = formatDateInZone(now, "Asia/Kolkata");
  const todayIST = new Date(`${todayISTStr}T12:00:00+05:30`);
  const currentDayOfWeek = todayIST.getDay(); // 0 = Sunday, 6 = Saturday

  let satOffset = 0;
  let sunOffset = 0;

  if (currentDayOfWeek === 6) {
    // Today is Saturday
    satOffset = 0;
    sunOffset = 1;
  } else if (currentDayOfWeek === 0) {
    // Today is Sunday
    satOffset = 6;
    sunOffset = 0;
  } else {
    // Monday (1) through Friday (5)
    satOffset = 6 - currentDayOfWeek;
    sunOffset = 7 - currentDayOfWeek;
  }

  const satDate = new Date(todayIST.getTime() + satOffset * 86400000);
  const sunDate = new Date(todayIST.getTime() + sunOffset * 86400000);

  const satISO = formatDateInZone(satDate, "Asia/Kolkata");
  const sunISO = formatDateInZone(sunDate, "Asia/Kolkata");

  const satLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(satDate);

  const sunLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(sunDate);

  return [
    {
      date: satISO,
      dayName: "Saturday",
      displayLabel: satLabel,
    },
    {
      date: sunISO,
      dayName: "Sunday",
      displayLabel: sunLabel,
    },
  ];
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

  // Generate slots strictly from 11:00 AM to 07:00 PM IST in 30-minute intervals
  let hour = 11;
  let minute = 0;

  // Slots run strictly from 11:00 AM to 07:00 PM IST (last slot starts at 18:30, ending at 19:00)
  while (hour < 18 || (hour === 18 && minute <= 30)) {
    const istStart = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    let endHour = hour;
    let endMin = minute + 30;
    if (endMin >= 60) {
      endHour += 1;
      endMin -= 60;
    }
    const istEnd = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

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

    minute += 30;
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
  }

  return slots;
}
