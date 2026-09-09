"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of zero interaction
const COUNTDOWN_SECONDS = 60; // 60 seconds countdown modal before pausing
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute heartbeat

export default function ActivityTracker() {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isMonitored, setIsMonitored] = useState<boolean>(true);
  const [currentStatus, setCurrentStatus] = useState<string>("working");
  const [showPrompt, setShowPrompt] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isIdlePaused, setIsIdlePaused] = useState(false);

  const lastInteractionTime = useRef<number>(0);
  const hasInteractedSinceHeartbeat = useRef<boolean>(true);
  const promptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Session Status Check
  const checkSessionStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/current");
      if (res.ok) {
        const data = await res.json();
        const checkedIn = Boolean(data.isCheckedIn);
        setIsCheckedIn(checkedIn);

        const monitored = data.isMonitored !== false;
        setIsMonitored(monitored);

        const status = data.activity?.status || "working";
        setCurrentStatus(status);

        if (!monitored) {
          setShowPrompt(false);
          setIsIdlePaused(false);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return;
        }

        if (status === "idle") {
          setIsIdlePaused(true);
        } else if (status === "working") {
          setIsIdlePaused(false);
        } else if (status === "break" || status === "training") {
          // Suppress idle prompt during break or training
          setShowPrompt(false);
          setIsIdlePaused(false);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        }
      } else {
        setIsCheckedIn(false);
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  useEffect(() => {
    if (!lastInteractionTime.current) {
      lastInteractionTime.current = Date.now();
    }
    const initialCheckTimer = setTimeout(() => {
      checkSessionStatus();
    }, 0);

    // Check on session change event, tab focus, or visibility change
    const onSessionChange = () => checkSessionStatus();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSessionStatus();
        lastInteractionTime.current = Date.now();
      }
    };

    window.addEventListener("activity-change", onSessionChange);
    window.addEventListener("focus", onSessionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Periodic poll every 30 seconds to keep state fresh
    const interval = setInterval(checkSessionStatus, 30 * 1000);

    return () => {
      clearTimeout(initialCheckTimer);
      window.removeEventListener("activity-change", onSessionChange);
      window.removeEventListener("focus", onSessionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [checkSessionStatus]);

  // 2. User Interaction Listeners
  const handleUserActivity = useCallback(() => {
    lastInteractionTime.current = Date.now();
    hasInteractedSinceHeartbeat.current = true;

    // If modal countdown is showing and user touches mouse/keyboard, auto-dismiss
    if (showPrompt) {
      setShowPrompt(false);
      setIsIdlePaused(false);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      fetch("/api/activity/idle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isIdle: false }),
      })
        .then(() => {
          if (typeof window !== "undefined") window.dispatchEvent(new Event("activity-change"));
        })
        .catch(() => {});
      return;
    }

    // If previously marked as idle/paused, auto-resume
    if (isIdlePaused) {
      setIsIdlePaused(false);
      fetch("/api/activity/idle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isIdle: false }),
      })
        .then(() => {
          if (typeof window !== "undefined") window.dispatchEvent(new Event("activity-change"));
        })
        .catch(() => {});
    }
  }, [isIdlePaused, showPrompt]);

  useEffect(() => {
    if (!isCheckedIn || !isMonitored) return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    let throttleTimeout: NodeJS.Timeout | null = null;

    const onEvent = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          handleUserActivity();
          throttleTimeout = null;
        }, 1000); // throttled to once per second
      }
    };

    events.forEach((ev) => window.addEventListener(ev, onEvent, { passive: true }));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onEvent));
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [isCheckedIn, isMonitored, handleUserActivity]);

  // 3. Heartbeat Loop
  useEffect(() => {
    if (!isCheckedIn) return;

    const sendHeartbeat = async () => {
      // If user is currently on break or in training, send zero delta
      if (currentStatus === "break" || currentStatus === "training") {
        try {
          await fetch("/api/activity/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isIdle: false,
              activeSecondsDelta: 0,
              idleSecondsDelta: 0,
            }),
          });
        } catch {
          // Ignore network errors
        }
        return;
      }

      // If user is not in a monitored role, send standard active heartbeat with 0 idle
      if (!isMonitored) {
        try {
          await fetch("/api/activity/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isIdle: false,
              activeSecondsDelta: 60,
              idleSecondsDelta: 0,
            }),
          });
        } catch {
          // Ignore network errors
        }
        return;
      }

      const now = Date.now();
      const timeSinceLastAction = now - lastInteractionTime.current;
      const isCurrentlyIdle = isIdlePaused || timeSinceLastAction >= IDLE_TIMEOUT_MS;

      try {
        await fetch("/api/activity/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isIdle: isCurrentlyIdle,
            activeSecondsDelta: isCurrentlyIdle ? 0 : 60,
            idleSecondsDelta: isCurrentlyIdle ? 60 : 0,
          }),
        });
      } catch {
        // Ignore network errors
      }

      hasInteractedSinceHeartbeat.current = false;
    };

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isCheckedIn, isMonitored, isIdlePaused, currentStatus]);

  // 4. Inactivity Monitor & Prompt Modal
  useEffect(() => {
    // Suppress inactivity warnings if not checked in, not monitored, already idle, or on break/training
    if (!isCheckedIn || !isMonitored || isIdlePaused || currentStatus === "break" || currentStatus === "training") {
      return;
    }

    const checkInactivity = () => {
      const elapsed = Date.now() - lastInteractionTime.current;

      if (elapsed >= IDLE_TIMEOUT_MS && !showPrompt) {
        // Trigger countdown modal
        setShowPrompt(true);
        setCountdown(COUNTDOWN_SECONDS);

        countdownIntervalRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              // Time expired without user confirmation -> switch to idle paused
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setShowPrompt(false);
              setIsIdlePaused(true);
              fetch("/api/activity/idle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isIdle: true }),
              })
                .then(() => {
                  if (typeof window !== "undefined") window.dispatchEvent(new Event("activity-change"));
                })
                .catch(() => {});
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    };

    promptTimeoutRef.current = setInterval(checkInactivity, 10 * 1000);

    return () => {
      if (promptTimeoutRef.current) clearInterval(promptTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isCheckedIn, isMonitored, isIdlePaused, showPrompt, currentStatus]);

  const confirmActive = () => {
    lastInteractionTime.current = Date.now();
    hasInteractedSinceHeartbeat.current = true;
    setShowPrompt(false);
    setIsIdlePaused(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    fetch("/api/activity/idle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isIdle: false }),
    })
      .then(() => {
        if (typeof window !== "undefined") window.dispatchEvent(new Event("activity-change"));
      })
      .catch(() => {});
  };

  if (!isCheckedIn || !isMonitored) return null;

  return (
    <>
      {/* Inactivity Warning Modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/50 p-6 max-w-md w-full text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Are You Still Working?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
              No activity has been detected for 5 minutes. Your work timer will be automatically paused in:
            </p>
            <div className="my-4 text-3xl font-extrabold text-amber-600 dark:text-amber-400">
              {countdown}s
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-6">
              Move your mouse or click below to continue tracking your active work hours.
            </p>
            <button
              onClick={confirmActive}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              ✓ I am Still Working
            </button>
          </div>
        </div>
      )}

      {/* Paused/Idle Notification Banner */}
      {isIdlePaused && !showPrompt && currentStatus !== "break" && currentStatus !== "training" && (
        <div className="fixed bottom-4 left-4 z-40 bg-amber-50 dark:bg-zinc-800 border border-amber-300 dark:border-amber-800/60 rounded-xl shadow-lg p-3 max-w-sm flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-300 block">Session Paused (Idle)</span>
              <span className="text-zinc-500 dark:text-zinc-400">Active timer is paused due to inactivity.</span>
            </div>
          </div>
          <button
            onClick={confirmActive}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg shrink-0 transition cursor-pointer"
          >
            Resume
          </button>
        </div>
      )}
    </>
  );
}
