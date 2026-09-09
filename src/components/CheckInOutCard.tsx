"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0",
  )}:${String(s).padStart(2, "0")}`;
};

type Activity = {
  id: number;

  checkIn: string;
  checkOut?: string | null;

  firstCheckIn?: string;
  lastCheckOut?: string | null;

  status: "working" | "idle" | "break" | "training" | "completed";

  workSeconds: number;
  shiftSeconds?: number;
  activeSeconds?: number;
  idleSeconds?: number;
  breakSeconds: number;
  trainingSeconds: number;

  actionsToday?: number;
  isGhostAlert?: boolean;

  breakStart?: string | null;
  trainingStart?: string | null;

  sessions: number;

  date: string;
};

export default function CheckInOutCard() {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [workTime, setWorkTime] = useState("00:00:00");
  const [breakTime, setBreakTime] = useState("00:00:00");
  const [trainingTime, setTrainingTime] = useState("00:00:00");
  const [isMonitored, setIsMonitored] = useState<boolean>(true);

  // Local clock tick — increments displayed time every second without hitting the server
  const [tickSeconds, setTickSeconds] = useState(0);

  useEffect(() => {
    fetchCurrentActivity();
  }, []);

  // Poll server every 30s (not every 1s — avoids flooding the DB)
  useEffect(() => {
    if (!isCheckedIn) return;
    const interval = setInterval(() => {
      fetchCurrentActivity();
    }, 30000);
    return () => clearInterval(interval);
  }, [isCheckedIn]);

  // Local tick every second just to increment the clock display
  useEffect(() => {
    if (!isCheckedIn) return;
    const tick = setInterval(() => setTickSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [isCheckedIn]);

  async function fetchCurrentActivity() {
    try {
      const res = await fetch("/api/activity/current");

      if (res.ok) {
        const data = await res.json();

        setIsCheckedIn(data.isCheckedIn);
        setIsMonitored(data.isMonitored !== false);
        setCurrentActivity(data.activity);
        setTickSeconds(0); // reset local tick on fresh server data

        if (data.activity) {
          setWorkTime(formatTime(data.activity.shiftSeconds ?? data.activity.workSeconds ?? 0));
          setBreakTime(formatTime(data.activity.breakSeconds || 0));
          setTrainingTime(formatTime(data.activity.trainingSeconds || 0));
        } else {
          setWorkTime("00:00:00");
          setBreakTime("00:00:00");
          setTrainingTime("00:00:00");
        }
      }
    } catch (error) {
      console.error("Failed to fetch activity:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn() {
    const loadingToast = toast.loading("Checking in...");
    try {
      const res = await fetch("/api/activity/checkin", {
        method: "POST",
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        const data = await res.json();
        setIsCheckedIn(true);
        setCurrentActivity(data.activity);
        fetchCurrentActivity();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("activity-change"));
        }

        toast.success("Checked in successfully!");
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to check in");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Failed to check in");
    }
  }

  async function handleCheckOut() {
    const loadingToast = toast.loading("Checking out...");
    try {
      const res = await fetch("/api/activity/checkout", {
        method: "POST",
      });

      toast.dismiss(loadingToast);

      if (res.ok) {
        const data = await res.json();
        setIsCheckedIn(false);
        setCurrentActivity(null);
        setWorkTime("00:00:00");
        setBreakTime("00:00:00");
        setTrainingTime("00:00:00");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("activity-change"));
        }
        toast.success(
          `Checked out! Work: ${data.workHours}h | Break: ${data.breakHours}h | Training: ${data.trainingHours}h`,
        );
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to check out");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Failed to check out");
    }
  }

  async function handleBreakStart() {
    const res = await fetch("/api/activity/break/start", {
      method: "POST",
    });

    const data = await res.json();

    if (res.ok) {
      await fetchCurrentActivity();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("activity-change"));
      }
      toast.success("Break started");
    } else {
      toast.error(data.message);
    }
  }

  async function handleBreakEnd() {
    const res = await fetch("/api/activity/break/end", {
      method: "POST",
    });

    const data = await res.json();

    if (res.ok) {
      toast.success("Break ended");
      fetchCurrentActivity();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("activity-change"));
      }
    } else {
      toast.error(data.message);
    }
  }

  async function handleTrainingStart() {
    const res = await fetch("/api/activity/training/start", {
      method: "POST",
    });

    const data = await res.json();

    if (res.ok) {
      toast.success("Training started");
      fetchCurrentActivity();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("activity-change"));
      }
    } else {
      toast.error(data.message);
    }
  }

  async function handleTrainingEnd() {
    const res = await fetch("/api/activity/training/end", {
      method: "POST",
    });

    const data = await res.json();

    if (res.ok) {
      toast.success("Training ended");
      fetchCurrentActivity();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("activity-change"));
      }
    } else {
      toast.error(data.message);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-linear-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Time Tracker</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {!isCheckedIn
              ? "Not checked in"
              : currentActivity?.status === "working"
                ? "Working"
                : currentActivity?.status === "idle"
                  ? "Idle (Paused)"
                : currentActivity?.status === "break"
                  ? "On Break"
                  : currentActivity?.status === "training"
                    ? "In Training"
                    : "Active"}
          </p>
        </div>
        <div
          className={`w-3 h-3 rounded-full ${
            isCheckedIn
              ? "bg-green-500 animate-pulse"
              : "bg-zinc-300 dark:bg-zinc-700"
          }`}
        ></div>
      </div>

      {isCheckedIn && (
        <div className="mb-6 text-center">
            <div className="inline-flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-xl px-6 py-4 w-full">
              <div className="flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-zinc-600 dark:text-zinc-400 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="text-xl font-bold">
                  Shift: {formatTime((currentActivity?.shiftSeconds ?? currentActivity?.workSeconds ?? 0) + tickSeconds)}
                </div>
              </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300 w-full pt-2 border-t border-zinc-200 dark:border-zinc-700/60">
              <div className="text-left font-semibold text-emerald-600 dark:text-emerald-400">
                🟢 Active: {formatTime(currentActivity?.activeSeconds || 0)}
              </div>
              <div className="text-right font-semibold text-amber-600 dark:text-amber-400">
                🟡 Idle: {formatTime(currentActivity?.idleSeconds || 0)}
              </div>
              <div className="text-left">Break: {breakTime}</div>
              <div className="text-right">Training: {trainingTime}</div>
            </div>

            {/* Actions recorded badge */}
            <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700/60 w-full flex items-center justify-between text-xs">
              <span className="text-zinc-500">Verified Work Actions:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                {currentActivity?.actionsToday || 0}
              </span>
            </div>
          </div>

          {/* Ghost Warning Banner for Employee (Only for monitored roles) */}
          {isMonitored && currentActivity?.isGhostAlert && (
            <div className="mt-2.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs text-center font-medium animate-pulse">
              ⚠️ Inactivity Warning:{" "}
              {(currentActivity?.actionsToday || 0) === 0
                ? "0 CRM actions recorded in over 10 mins of work time."
                : `No CRM actions for 10+ mins (last action was ${currentActivity.actionsToday} action${(currentActivity.actionsToday ?? 1) > 1 ? "s" : ""} ago).`}{" "}
              Please update your leads or tasks.
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
            Checked in at{" "}
            {currentActivity &&
              new Date(
                currentActivity.firstCheckIn ||
                currentActivity.checkIn
              ).toLocaleTimeString()}
          </p>
        </div>
      )}

      {isCheckedIn && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(currentActivity?.status === "working" || currentActivity?.status === "idle") && (
            <>
              <button
                onClick={handleBreakStart}
                className="py-2 rounded-lg bg-yellow-500 text-white"
              >
                Start Break
              </button>

              <button
                onClick={handleTrainingStart}
                className="py-2 rounded-lg bg-purple-500 text-white"
              >
                Start Training
              </button>
            </>
          )}

          {currentActivity?.status === "break" && (
            <button
              onClick={handleBreakEnd}
              className="col-span-2 py-2 rounded-lg bg-green-500 text-white"
            >
              End Break
            </button>
          )}

          {currentActivity?.status === "training" && (
            <button
              onClick={handleTrainingEnd}
              className="col-span-2 py-2 rounded-lg bg-green-500 text-white"
            >
              End Training
            </button>
          )}
        </div>
      )}
      <button
        onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
        className={`w-full py-3 rounded-lg font-semibold transition-all ${
          isCheckedIn
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white"
        }`}
      >
        {isCheckedIn ? "Check Out" : "Check In"}
      </button>
    </div>
  );
}
