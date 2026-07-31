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

export default function NewMessagePopup() {
  const { isOpen, selectedConversation, setIsOpen, setSelectedConversation } =
    useChat();

  const [popup, setPopup] = useState<IncomingPopup | null>(null);

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

  // Ask for OS-level notification permission once, on first load, so that
  // new-message alerts can show even when the CRM tab isn't focused (e.g.
  // the person is in another app on their laptop).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

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
        gain.gain.linearRampToValueAtTime(1, startTime + 0.02);
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
  // even while the person is working in a different app on their laptop.
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

  if (!popup) return null;

  return (
    <div
      className="
        fixed
        inset-0
        z-[10000]
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
  );
}