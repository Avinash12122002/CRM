export type WhatsAppStep =
  | "WELCOME"
  | "AWAITING_EMAIL"
  | "SENDING_INFO_SEQUENCE"
  | "VIDEO_SENT_AWAITING_INTEREST"
  | "AWAITING_CONSULTATION_DECISION"
  | "SELECTING_DAY"
  | "SELECTING_SLOT"
  | "BOOKED"
  | "MEETING_COMPLETED"
  | "AWAITING_CV"
  | "RESCHEDULING_DATE"
  | "RESCHEDULING_SLOT"
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

export type MeetingStatusType = "none" | "booked" | "rescheduled" | "canceled" | "completed";

export interface MeetingHistoryItem {
  action: "booked" | "rescheduled" | "canceled" | "completed";
  date?: string;
  candidateTime?: string;
  istTime?: string;
  timestamp: Date;
  reason?: string;
  previousSlot?: {
    date: string;
    candidateTime: string;
    istTime: string;
  };
}

export interface WhatsAppSession {
  phone: string; // Clean digits with dial code e.g. "2348012345678"
  name?: string;
  email?: string;
  countryCode: string;
  countryName: string;
  interestedCountry?: string; // e.g. "Australia"
  timeZone: string;
  timeZoneLabel: string;
  currentStep: WhatsAppStep;
  leadId?: number; // Linked integer CRM lead ID
  followupCount: number; // 0-7 for 7-day follow-up cycle
  paymentFollowupCount?: number;
  lastFollowupSentAt?: Date;
  nextFollowupAt?: Date;
  videoSentAt?: Date;
  consultationPromptDueAt?: Date;
  infoEmailSentAt?: Date;
  cvReceivedAt?: Date;
  cvFileUrl?: string;
  cvFileName?: string;

  // Candidate Qualifications & Profiling
  occupation?: string;
  occupationSector?: string;
  yearsExperience?: string | number;
  highestQualification?: string;
  englishTestStatus?: string;
  candidateNotes?: string[];

  // Extended Candidate Profile (auto-extracted from conversation)
  currentJobTitle?: string;       // e.g. "Software Engineer", "Nurse", "Chef"
  currentEmployer?: string;       // e.g. "Infosys", "Apollo Hospital"
  currentSalary?: string;         // e.g. "INR 8 LPA"
  desiredSalary?: string;         // e.g. "AUD 90,000"
  maritalStatus?: string;         // e.g. "Married", "Single"
  ageRange?: string;              // e.g. "28", "30-35"
  familySize?: string;            // e.g. "Wife + 1 child"
  hasPassport?: boolean;          // true/false
  languageSpoken?: string;        // e.g. "Hindi, English"
  candidateGoals?: string;        // e.g. "PR pathway", "Better salary"
  adminNotes?: string;            // Notes added by admin from CRM
  lastOutboundMessage?: string;   // Last message sent BY system TO candidate
  lastOutboundAt?: Date;

  // Full Conversation History (every message candidate ever sent)
  conversationHistory?: Array<{
    role: "candidate" | "system"; // who sent this message
    message: string;              // actual text
    timestamp: Date;              // when it was sent
    step: string;                 // which funnel step they were at
  }>;

  // Meeting Lifecycle Tracking
  meetingStatus?: MeetingStatusType;
  meetingBookedAt?: Date;
  meetingRescheduledAt?: Date;
  meetingRescheduledCount?: number;
  meetingCompletedAt?: Date;
  meetingCanceledAt?: Date;
  meetingCancellationReason?: string;
  meetingHistory?: MeetingHistoryItem[];

  bookedSlot?: {
    date: string;
    candidateTime: string;
    candidateTimeLabel: string;
    istTime: string;
    istTimeLabel: string;
    meetingUserId: number;
    meetingUserName: string;
  };
  activeSlotsDate?: string;
  meetingCompleted?: boolean;
  paymentPending?: boolean;
  lastInteractionAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeekendSlot {
  date: string;
  dayLabel: string;
  istStartTime: string;
  istEndTime: string;
  candidateDate: string;
  candidateStartTime: string;
  candidateEndTime: string;
  candidateDisplayLabel: string;
  istDisplayLabel: string;
  available: boolean;
  meetingUserId?: number;
}
