// Business Development pipeline module — shared constants
// New module, does not touch existing "leads" collection or its statuses.

export const PIPELINE_STAGES = [
  "New Lead",
  "Research Started",
  "Priority Set",
  "Initial Contact",
  "Response Received",
  "Meeting Scheduled",
  "Follow Up",
  "Deal Done",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type BDLeadStatus = "active" | "deal_done" | "lost";

export const DAILY_LEAD_TARGET = 25;
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Role used for Business Development pipeline users
export const BD_ROLE = "business_development";

// Roles allowed to use the Data Entry module (daily-quota lead submission).
// Business Development users create their own leads directly from the BD
// Pipeline page instead (self-assigned, no daily quota) — see leads/create.
export const DATA_ENTRY_ROLES = ["employee", "meeting"];

export const INDUSTRIES = [
  "Hotel & Resorts",
  "Restaurant",
  "Construction Companies",
  "Manufacturer Company",
  "Logistic",
  "Food Processing",
  "Agriculture Based",
  "Cleaning & Facility",
  "Retail & Supermarkets",
  "Immigration Lawyers",
  "Recruitment Companies",
  "Job Portals",
] as const;

export const LEAD_SOURCES = [
  "Google Maps",
  "Search Engines",
  "Business Directories",
  "Job Portals",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const BD_COLLECTIONS = {
  leads: "bdleads",
  pipelineHistory: "bdpipelinehistory",
  notes: "bdleadnotes",
  dailyTargets: "dailyleadtargets",
  activityLogs: "bdactivitylogs",
  config: "bdconfig",
};
