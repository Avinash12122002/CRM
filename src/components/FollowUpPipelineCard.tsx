"use client";

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  FollowUpStage,
  FOLLOW_UP_STAGE_CONFIGS,
  FOLLOW_UP_STAGES_LIST,
  FollowUpWorkflowState,
} from "@/lib/followUpWorkflow";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  status: string;
  assignedTo?: number | null;
  assignedToName?: string;
  meetingCompletedAt?: string;
  followUpWorkflow?: FollowUpWorkflowState | null;
}

interface FollowUpPipelineCardProps {
  leadId: number;
  lead: Lead;
  currentUser: User;
  onWorkflowUpdated?: (
    updatedWorkflow: FollowUpWorkflowState,
    newStatus?: string,
    extra?: {
      assignedTo?: number;
      assignedToName?: string;
      assignedToRole?: string;
    }
  ) => void;
  isTriloknath?: boolean;
}

export default function FollowUpPipelineCard({
  leadId,
  lead,
  currentUser,
  onWorkflowUpdated,
  isTriloknath = false,
}: FollowUpPipelineCardProps) {
  // Access control guard: Strictly visible ONLY to admin and follow_up users
  if (currentUser.role !== "admin" && currentUser.role !== "follow_up") {
    return null;
  }

  const [workflow, setWorkflow] = useState<FollowUpWorkflowState | null>(
    lead.followUpWorkflow || null
  );
  const [markingSent, setMarkingSent] = useState(false);

  // Not Interested modal state
  const [showNotInterestedModal, setShowNotInterestedModal] = useState(false);
  const [submittingNotInterested, setSubmittingNotInterested] = useState(false);

  // Endpoint base
  const apiBase = isTriloknath
    ? `/api/triloknath/leads/${leadId}/follow-up-pipeline`
    : `/api/leads/${leadId}/follow-up-pipeline`;

  // Fetch pipeline status
  const fetchPipelineData = async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) {
        if (res.status === 403) return;
        throw new Error("Failed to load pipeline data");
      }
      const data = await res.json();
      if (data.lead?.followUpWorkflow) {
        setWorkflow(data.lead.followUpWorkflow);
      } else if (!workflow && lead.meetingCompletedAt) {
        setWorkflow({
          currentStage: "info",
          status: "in_progress",
          stages: {},
          nextFollowupAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPipelineData();
  }, [leadId]);

  // Derive workflow state
  const currentWorkflow: FollowUpWorkflowState = workflow || {
    currentStage: "info",
    status: "in_progress",
    stages: {},
    nextFollowupAt: new Date(),
    updatedAt: new Date(),
  };

  const currentStage = currentWorkflow.currentStage;
  const isCompleted = currentWorkflow.status === "completed" || currentStage === "completed";
  const isNotInterested =
    currentWorkflow.status === "not_interested" || lead.status === "not-interested";

  // Check 2-day reminder status
  const nextDueDate = currentWorkflow.nextFollowupAt
    ? new Date(currentWorkflow.nextFollowupAt)
    : null;
  const isOverdue = nextDueDate ? nextDueDate.getTime() <= Date.now() : false;

  // Mark Stage as Sent API call
  const handleMarkAsSent = async (stage: FollowUpStage) => {
    const config = FOLLOW_UP_STAGE_CONFIGS[stage];
    if (
      !window.confirm(
        `Confirm that you have sent ${config.label} via Gmail? This will advance to the next stage.`
      )
    ) {
      return;
    }

    try {
      setMarkingSent(true);
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to mark as sent");

      toast.success(data.message || `${config.label} marked as sent!`);
      setWorkflow(data.followUpWorkflow);
      if (onWorkflowUpdated) {
        onWorkflowUpdated(data.followUpWorkflow, data.newStatus, {
          assignedTo: data.assignedTo,
          assignedToName: data.assignedToName,
          assignedToRole: data.assignedToRole,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error marking stage as sent");
    } finally {
      setMarkingSent(false);
    }
  };

  // Mark Not Interested API call
  const handleMarkNotInterested = async () => {
    try {
      setSubmittingNotInterested(true);
      const notInterestedUrl = isTriloknath
        ? `/api/triloknath/leads/${leadId}/follow-up-pipeline/not-interested`
        : `/api/leads/${leadId}/follow-up-pipeline/not-interested`;

      const res = await fetch(notInterestedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update status");

      toast.success("Lead marked as Not Interested.");
      setWorkflow(data.followUpWorkflow);
      setShowNotInterestedModal(false);
      if (onWorkflowUpdated) {
        onWorkflowUpdated(data.followUpWorkflow, "not-interested");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error updating status");
    } finally {
      setSubmittingNotInterested(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl px-4 py-3 mb-6 border border-gray-200 dark:border-gray-700 transition">
      {/* ─── Top Compact Bar: Title, Status Badge, Not Interested Button ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Follow-Up Email Pipeline
          </span>

          {isNotInterested ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200">
              Not Interested (Stopped)
            </span>
          ) : isCompleted ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
              Completed ✓
            </span>
          ) : isOverdue ? (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse flex items-center gap-1">
              🔥 Action Due Now
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              In Progress
            </span>
          )}
        </div>

        {/* Not Interested action */}
        {!isNotInterested && !isCompleted && (
          <button
            type="button"
            onClick={() => setShowNotInterestedModal(true)}
            className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg transition cursor-pointer"
          >
            Not Interested
          </button>
        )}
      </div>

      {/* ─── Compact Horizontal Pipeline Stepper with Arrow Signs ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {FOLLOW_UP_STAGES_LIST.map((stageKey, idx) => {
          const config = FOLLOW_UP_STAGE_CONFIGS[stageKey];
          const stageData = currentWorkflow.stages?.[stageKey];
          const isStageCompleted = !!stageData;
          const isCurrentActive =
            !isStageCompleted &&
            (currentStage === stageKey || (!isCompleted && !isNotInterested && idx === 0 && !currentStage));

          return (
            <React.Fragment key={stageKey}>
              {/* Step Pill */}
              <div
                className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  isStageCompleted
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200"
                    : isCurrentActive
                    ? isNotInterested
                      ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-500 opacity-60"
                      : "bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100 ring-1 ring-blue-500/30 font-semibold"
                    : "bg-gray-50/70 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-70"
                }`}
              >
                {/* Status indicator icon or number */}
                {isStageCompleted ? (
                  <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    ✓
                  </span>
                ) : isCurrentActive ? (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {idx + 1}
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 flex items-center justify-center text-[10px] font-medium shrink-0">
                    {idx + 1}
                  </span>
                )}

                {/* Stage Label */}
                <span>{config.label}</span>

                {/* Action Button inside active step */}
                {isCurrentActive && !isNotInterested && (
                  <button
                    type="button"
                    disabled={markingSent}
                    onClick={() => handleMarkAsSent(stageKey)}
                    className="ml-1.5 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Mark Sent
                  </button>
                )}
              </div>

              {/* Arrow sign between steps */}
              {idx < FOLLOW_UP_STAGES_LIST.length - 1 && (
                <span className="text-gray-300 dark:text-gray-600 font-bold shrink-0 text-sm select-none">
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ─── Not Interested Confirmation Modal ─── */}
      {showNotInterestedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/60 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
              Mark Candidate As Not Interested?
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              This will change lead status to <strong>Not Interested</strong> and stop the follow-up pipeline.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNotInterestedModal(false)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingNotInterested}
                onClick={handleMarkNotInterested}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {submittingNotInterested ? "Saving..." : "Yes, Mark Not Interested"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
