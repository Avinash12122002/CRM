export type WhatsAppStep =
  | "WELCOME"
  | "AWAITING_EMAIL"
  | "SENDING_INFO_SEQUENCE"
  | "VIDEO_SENT_AWAITING_INTEREST"
  | "SELECTING_DAY"
  | "SELECTING_SLOT"
  | "BOOKED"
  | "MEETING_COMPLETED"
  | "AWAITING_REENGAGEMENT"
  | "COLD"
  | "OPTED_OUT";

export interface CountryTimezoneInfo {
  countryCode: string;
  countryName: string;
  dialCode: string;
  timeZone: string; // IANA timezone e.g. "Africa/Lagos", "Asia/Kolkata"
  label: string; // e.g. "WAT (West Africa Time)"
}

export interface WhatsAppSession {
  phone: string; // Clean digits with dial code e.g. "2348012345678"
  name?: string;
  email?: string;
  countryCode: string;
  countryName: string;
  timeZone: string;
  timeZoneLabel: string;
  currentStep: WhatsAppStep;
  leadId?: number; // Linked integer CRM lead ID
  followupCount: number; // 0, 1, 2, 3 (for 6-day cycle: Day 2, 4, 6)
  paymentFollowupCount?: number; // Count for post-meeting unpaid follow-ups
  lastFollowupSentAt?: Date;
  nextFollowupAt?: Date;
  videoSentAt?: Date;
  bookedSlot?: {
    date: string; // YYYY-MM-DD
    candidateTime: string; // e.g. "16:30" (WAT)
    candidateTimeLabel: string; // e.g. "04:30 PM WAT"
    istTime: string; // e.g. "21:00" (IST)
    istTimeLabel: string; // e.g. "09:00 PM IST"
    meetingUserId: number;
    meetingUserName: string;
  };
  meetingCompleted?: boolean;
  paymentPending?: boolean;
  lastInteractionAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeekendSlot {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Sunday, 28 Sep"
  istStartTime: string; // e.g. "11:00"
  istEndTime: string; // e.g. "11:30"
  candidateDate: string; // YYYY-MM-DD in candidate timezone
  candidateStartTime: string; // e.g. "06:30"
  candidateEndTime: string; // e.g. "07:00"
  candidateDisplayLabel: string; // "04:30 PM - 05:00 PM (Nigeria WAT)"
  istDisplayLabel: string; // "11:00 AM - 11:30 AM (IST)"
  available: boolean;
  meetingUserId?: number;
}
