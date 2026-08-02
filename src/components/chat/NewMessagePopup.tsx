"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

type Conversation = {
  id: number;
  otherUserId: number;
  otherUserName: string;
  otherUserUsername?: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

type IncomingPopup = {
  conversationId: number;
  name: string;
  message: string;
};

type PrevEntry = {
  lastMessageAt: string | null;
  unreadCount: number;
};

// Defined locally instead of relying on the ambient `NotificationPermission`
// type from lib.dom — avoids depending on tsconfig's "lib" setup.
type PermissionState = "default" | "denied" | "granted" | "unsupported";

export default function NewMessagePopup() {
  const { isOpen, selectedConversation, setIsOpen, setSelectedConversation } =
    useChat();

  const [popup, setPopup] = useState<IncomingPopup | null>(null);

  // Always start as "unsupported" so the very first render is IDENTICAL
  // on the server and on the client (hydration pass). We only read the
  // real Notification.permission value inside a useEffect below, which
  // runs after hydration has committed — never during it — so there's
  // no server/client markup mismatch.
  const [permission, setPermission] = useState<PermissionState>("unsupported");

  const [bannerDismissed, setBannerDismissed] = useState(false);

  const prevRef = useRef<Map<number, PrevEntry> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpenRef = useRef(isOpen);
  const selectedConversationRef = useRef(selectedConversation);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // Read the real permission state once mounted (post-hydration).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission as PermissionState);
  }, []);

  // Web Audio API has no "permission" concept — there is no dialog for it.
  // Audio is gated purely by the browser's autoplay policy: an AudioContext
  // starts suspended until a real user gesture happens. We unlock it here,
  // as a plain function (not a listener), so we can call it directly from
  // the Enable button's own click handler — guaranteeing it fires exactly
  // when the user interacts, instead of hoping a separate global listener
  // picks it up first.
  const unlockAudio = () => {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    audioCtxRef.current?.resume().catch(() => {});
  };

  // Still keep a passive global unlock too, in case the person interacts
  // with something else on the page before ever seeing the banner.
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("click", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  const requestPermission = async () => {
    // Unlock audio immediately, synchronously, inside the click handler —
    // don't wait on the async permission prompt first.
    unlockAudio();

    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkForNewMessages();

    const interval = setInterval(checkForNewMessages, 5000);

    return () => {
      clearInterval(interval);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForNewMessages = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;

      const data = await res.json();
      const conversations: Conversation[] = data.conversations || [];

      const prev = prevRef.current;
      const next = new Map<number, PrevEntry>();

      let incoming: IncomingPopup | null = null;

      for (const conv of conversations) {
        next.set(conv.id, {
          lastMessageAt: conv.lastMessageAt,
          unreadCount: conv.unreadCount,
        });

        // Skip comparison on the very first load — just establish a baseline
        // so we don't pop up a toast for every already-unread message.
        if (!prev) continue;

        const prevEntry = prev.get(conv.id);
        const prevUnread = prevEntry?.unreadCount ?? 0;
        const prevAt = prevEntry?.lastMessageAt ?? null;

        const hasNewTimestamp =
          !!conv.lastMessageAt && conv.lastMessageAt !== prevAt;
        const unreadIncreased = conv.unreadCount > prevUnread;

        if (hasNewTimestamp && unreadIncreased) {
          const alreadyViewing =
            isOpenRef.current &&
            selectedConversationRef.current === conv.id;

          if (!alreadyViewing) {
            incoming = {
              conversationId: conv.id,
              name: conv.otherUserName || "Someone",
              message: conv.lastMessage || "Sent you a new message",
            };
          }
        }
      }

      prevRef.current = next;

      if (incoming) {
        showPopup(incoming);
        playSound();
        showDesktopNotification(incoming);
      }
    } catch {
      // silently ignore — popup is a nice-to-have, not critical
    }
  };

  const showPopup = (data: IncomingPopup) => {
    setPopup(data);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  };

  // Short, synthesized "ping" — no external audio file needed. Two quick
  // tones through the Web Audio API.
  const playSound = () => {
    try {
      if (typeof window === "undefined") return;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const playTone = (freq: number, startOffset: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = freq;
        oscillator.connect(gain);
        gain.connect(ctx.destination);

        const startTime = ctx.currentTime + startOffset;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.55, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.05);
      };

      playTone(880, 0, 0.18);
      playTone(1175, 0.12, 0.2);
      playTone(1175, 0.28, 0.22);
    } catch {
      // ignore — sound is a nice-to-have
    }
  };

  // Native OS notification — shows in the system tray / notification center
  // even while the person is working in a completely different app, as long
  // as this browser tab/window is still open somewhere (foreground or
  // background). This is what makes messages visible "wherever you are."
  const showDesktopNotification = (data: IncomingPopup) => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const notification = new Notification(`New message from ${data.name}`, {
        body: data.message,
        icon: "/logo.png",
        tag: `conversation-${data.conversationId}`,
      });

      notification.onclick = () => {
        window.focus();
        setSelectedConversation(data.conversationId);
        setIsOpen(true);
        notification.close();
      };
    } catch {
      // ignore — desktop notification is a nice-to-have
    }
  };

  const handleClose = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setPopup(null);
  };

  const handleOpen = () => {
    if (!popup) return;
    setSelectedConversation(popup.conversationId);
    setIsOpen(true);
    handleClose();
  };

  if (!popup && (permission !== "default" || bannerDismissed)) return null;

  return (
    <>
      {/* Permission banner — only a real click can trigger the browser's
          notification permission prompt, so we ask via a visible button
          instead of doing it silently on load.
          pointer-events-auto + a very high z-index guard against any
          ancestor wrapper (modals, drawers, overlays) that sets
          pointer-events:none or a lower stacking context, which is the
          most common reason a fixed banner like this stops being clickable. */}
      {permission === "default" && !bannerDismissed && (
        <div
          className="fixed bottom-24 right-6 z-2147483000 max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 pointer-events-auto"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Turn on desktop alerts
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            See new messages even when you&apos;re on another tab or app.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                requestPermission();
              }}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition cursor-pointer"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unlockAudio();
                setBannerDismissed(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {permission === "denied" && !bannerDismissed && (
        <div
          className="fixed bottom-24 right-6 z-2147483000 max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 pointer-events-auto"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Desktop alerts are blocked
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Click the lock/info icon next to the address bar, set
            Notifications to &quot;Allow&quot;, then reload this page.
          </p>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBannerDismissed(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Center-screen popup for the message itself */}
      {popup && (
        <div
          className="
            fixed
            inset-0
            z-2147483001
            flex
            items-start
            justify-center
            pt-24
            px-4
            pointer-events-none
          "
        >
          <div
            role="alert"
            onClick={handleOpen}
            className="
              pointer-events-auto
              w-full
              max-w-sm
              bg-red-600
              dark:bg-red-700
              border
              border-red-700
              dark:border-red-800
              rounded-2xl
              shadow-2xl
              p-4
              cursor-pointer
              transition-all
              duration-200
            "
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-white/20 text-white flex items-center justify-center">
                <MessageCircle size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  New message from {popup.name}
                </p>
                <p className="text-sm text-red-50 truncate mt-0.5">
                  {popup.message}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                aria-label="Dismiss"
                className="
                  shrink-0
                  w-7
                  h-7
                  flex
                  items-center
                  justify-center
                  rounded-full
                  text-white/80
                  hover:text-white
                  hover:bg-white/20
                  transition
                "
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}