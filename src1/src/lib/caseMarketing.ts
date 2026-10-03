// Shared, isomorphic (client + server) constants and helpers for the
// Case Manager "CV Marketing Workspace" module.
//
// This module intentionally contains NO database access — it is safe to
// import from both API routes and client components.

export type MarketingPhase = 1 | 2 | 3 | 4;

export interface PhaseConfig {
  phase: MarketingPhase;
  key: string;
  label: string;
  /** Singular label for one "source" in this phase, e.g. "Job Board" */
  sourceLabel: string;
  /** Plural label, e.g. "Job Boards" */
  sourceLabelPlural: string;
  /** Suggested presets shown as quick-add chips (may be empty) */
  presets: string[];
  description: string;
}

// LinkedIn Companies is deliberately folded into Phase 1 (Job Boards) per
// the finalized workflow — it is not a separate 5th phase.
export const PHASES: PhaseConfig[] = [
  {
    phase: 1,
    key: "job_boards",
    label: "Job Boards",
    sourceLabel: "Job Board",
    sourceLabelPlural: "Job Boards",
    presets: [],
    description: "Add every job board (including LinkedIn) and work through them one at a time.",
  },
  {
    phase: 2,
    key: "google_search",
    label: "Google Search",
    sourceLabel: "Keyword",
    sourceLabelPlural: "Keywords",
    presets: [],
    description: "Add Google search keywords and research employers found under each one.",
  },
  {
    phase: 3,
    key: "core_employers",
    label: "Core Employers",
    sourceLabel: "Category",
    sourceLabelPlural: "Categories",
    presets: [],
    description: "Add core employer categories relevant to the candidate's occupation.",
  },
  {
    phase: 4,
    key: "industry_directories",
    label: "Industry Directories",
    sourceLabel: "Directory",
    sourceLabelPlural: "Directories",
    presets: [],
    description: "Add relevant industry directories and research employers listed in each.",
  },
];

export function getPhaseConfig(phase: number): PhaseConfig | undefined {
  return PHASES.find((p) => p.phase === phase);
}

// ── Employer response status ────────────────────────────────────────────
export interface StatusOption {
  value: string;
  /** Terminal statuses immediately stop the automatic follow-up cycle */
  terminal: boolean;
}

export const STATUS_OPTIONS: StatusOption[] = [
  { value: "Interested", terminal: true },
  { value: "Interview Scheduled", terminal: true },
  { value: "Need Updated CV", terminal: true },
  { value: "Need More Information", terminal: false },
  { value: "Future Requirement", terminal: true },
  { value: "Position Filled", terminal: true },
  { value: "Not Hiring Overseas", terminal: false },
  { value: "Not Interested", terminal: true },
  { value: "Invalid Email", terminal: true },
  { value: "Wrong Contact", terminal: true },
  { value: "No Response", terminal: true },
  { value: "Other", terminal: false },
];

export function isTerminalStatus(status?: string | null): boolean {
  if (!status) return false;
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  return found ? found.terminal : false;
}

// ── Automatic follow-up engine (fully computed, no cron required) ──────
// Day 0 = email sent. Reminders fall due every 10 days up to day 60, after
// which the cycle closes automatically with status "No Response" (unless a
// status was already recorded).
export const FOLLOWUP_INTERVAL_DAYS = 10;
export const FOLLOWUP_MAX_CYCLES = 6; // day 10,20,30,40,50,60

export interface FollowupInfo {
  /** Number of 10-day follow-up windows that have fully elapsed (0-6) */
  stage: number;
  /** Human label for the current/most recent follow-up window */
  label: string;
  /** Date the next follow-up becomes due (null once closed) */
  nextDueDate: Date | null;
  /** True once 60 days have passed with no terminal status set */
  closed: boolean;
  /** True if a follow-up is due today or overdue, and the record is open */
  isDueOrOverdue: boolean;
  daysSinceEmail: number;
}

export function getFollowupInfo(
  emailSentAt: string | Date | null | undefined,
  status: string | null | undefined,
  lastFollowupAt?: string | Date | null,
  followupCount: number = 0,
): FollowupInfo | null {
  if (!emailSentAt) return null;

  const sentDate = new Date(emailSentAt);
  const now = new Date();
  const daysSinceEmail = Math.floor((now.getTime() - sentDate.getTime()) / 86400000);

  const terminal = isTerminalStatus(status);

  if (terminal) {
    return {
      stage: Math.min(followupCount, FOLLOWUP_MAX_CYCLES),
      label: status || "Closed",
      nextDueDate: null,
      closed: true,
      isDueOrOverdue: false,
      daysSinceEmail,
    };
  }

  // 60-day cap OR 6 follow-ups logged cap
  if (daysSinceEmail >= FOLLOWUP_MAX_CYCLES * FOLLOWUP_INTERVAL_DAYS || followupCount >= FOLLOWUP_MAX_CYCLES) {
    return {
      stage: FOLLOWUP_MAX_CYCLES,
      label: "60 Days Complete — Auto Closed (No Response)",
      nextDueDate: null,
      closed: true,
      isDueOrOverdue: false,
      daysSinceEmail,
    };
  }

  // Anchor date for next 10-day cycle is lastFollowupAt if available, else emailSentAt
  const anchorDate = lastFollowupAt ? new Date(lastFollowupAt) : sentDate;
  const nextDueDate = new Date(anchorDate.getTime() + FOLLOWUP_INTERVAL_DAYS * 86400000);
  const isDueOrOverdue = now.getTime() >= nextDueDate.getTime();

  const currentStage = Math.min(followupCount + 1, FOLLOWUP_MAX_CYCLES);

  return {
    stage: currentStage,
    label: followupCount === 0 ? "Awaiting 1st Follow-up (Day 10)" : `Follow-up ${followupCount} Completed`,
    nextDueDate,
    closed: false,
    isDueOrOverdue,
    daysSinceEmail,
  };
}

// ── Marketing summary aggregation shape (used by summary API + UI) ─────
export interface MarketingSummary {
  totalEmployers: number;
  employersByPhase: Record<number, number>;
  initialEmailsSent: number;
  followupsDueToday: number;
  totalReplies: number;
  interestedEmployers: number;
  interviewsScheduled: number;
  averageResponseRate: number; // percentage 0-100
  completionPercent: number; // percentage 0-100
  currentPhase: number;
  currentSourceName: string | null;
  /** True for each phase number that has all its sources completed */
  phaseCompletionStatus?: Record<number, boolean>;
}
