"use client";

import React, { useState, useEffect, useRef } from "react";
import DashboardNavbar from "@/components/DashboardNavbar";
import toast from "react-hot-toast";
import {
  MessageSquare,
  Send,
  RotateCcw,
  CheckCheck,
  Video,
  Calendar,
  Clock,
  ExternalLink,
  Sparkles,
  User,
  ShieldCheck,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text?: string;
  type: "text" | "video" | "buttons" | "list";
  videoUrl?: string;
  videoCaption?: string;
  buttons?: Array<{ id: string; title: string }>;
  listHeader?: string;
  listSections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  timestamp: string;
}

interface UserAuth {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "telecaller" | "employee" | "meeting" | "business_development" | "billing" | "case_manager" | "wm" | "wcm" | "wtc" | "supervisor" | "follow_up" | "trainee";
}

const PRESET_NUMBERS = [
  { name: "Nigeria (WAT)", phone: "2348012345678", flag: "🇳🇬" },
  { name: "India (IST)", phone: "919876543210", flag: "🇮🇳" },
  { name: "UAE (GST)", phone: "971501234567", flag: "🇦🇪" },
  { name: "United Kingdom", phone: "447911123456", flag: "🇬🇧" },
];

export default function WhatsAppSimulatorPage() {
  const [currentUser, setCurrentUser] = useState<UserAuth | null>(null);
  const [phone, setPhone] = useState("2348012345678");
  const [candidateName, setCandidateName] = useState("John Doe");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const msgCounterRef = useRef(0);

  const createUniqueMsgId = (prefix: string) => {
    msgCounterRef.current += 1;
    return `${prefix}_${Date.now()}_${msgCounterRef.current}_${Math.random().toString(36).slice(2, 8)}`;
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(console.error);

    // Initial greeting trigger - prevent double firing in React StrictMode
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      triggerAction({ text: "Hi" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const triggerAction = async (payload: {
    text?: string;
    selectedId?: string;
    messageType?: "text" | "interactive_button" | "interactive_list";
  }) => {
    setLoading(true);

    if (payload.text) {
      setMessages((prev) => [
        ...prev,
        {
          id: createUniqueMsgId("user"),
          sender: "user",
          text: payload.text,
          type: "text",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }

    try {
      const res = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          senderName: candidateName,
          textBody: payload.text,
          selectedId: payload.selectedId,
          messageType: payload.messageType || (payload.selectedId ? "interactive_button" : "text"),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Simulation error");
        return;
      }

      setSession(data.session);

      if (data.result?.replyText) {
        setMessages((prev) => [
          ...prev,
          {
            id: createUniqueMsgId("bot"),
            sender: "bot",
            text: data.result.replyText,
            type: "text",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to connect to simulator API");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;
    const txt = inputMessage.trim();
    setInputMessage("");
    triggerAction({ text: txt });
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, action: "reset" }),
      });
      if (res.ok) {
        setMessages([]);
        setSession(null);
        toast.success("Conversation reset. Starting fresh...");
        triggerAction({ text: "Hi" });
      }
    } catch {
      toast.error("Failed to reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {currentUser && <DashboardNavbar user={currentUser} />}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
              <Sparkles className="w-4 h-4" />
              <span>TMS Visa 100% Automated WhatsApp Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              WhatsApp Ad-to-Meeting Funnel & AI Counselor Simulator
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Simulates candidate qualification, 10s video/guide delivery, weekend 30-min slots (11am-7pm IST translated to local time), and auto-assignment to consultant Abhay.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Conversation
            </button>
          </div>
        </div>

        {/* Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: WhatsApp Smartphone Mockup */}
          <div className="lg:col-span-7 flex justify-center">
            <div className="w-full max-w-md bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[700px] relative">
              {/* WhatsApp Top Bar */}
              <div className="bg-emerald-700 text-white px-4 py-3.5 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white text-emerald-800 font-bold flex items-center justify-center text-sm shadow">
                    TMS
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                      The Migration School 🇦🇺
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                    </h2>
                    <p className="text-xs text-emerald-100 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                      Official WhatsApp Business
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs text-emerald-200">
                  <span className="block font-medium">+{phone}</span>
                  <span className="text-[10px] text-emerald-300">
                    {session?.timeZoneLabel || "Detecting..."}
                  </span>
                </div>
              </div>

              {/* Chat Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0b141a] bg-opacity-95">
                <div className="text-center my-2">
                  <span className="bg-[#182229] text-[#8696a0] text-[11px] px-3 py-1 rounded-lg border border-[#222e35]">
                    🔒 Messages are end-to-end encrypted and handled by TMS Visa.
                  </span>
                </div>

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm relative ${
                        m.sender === "user"
                          ? "bg-[#005c4b] text-white rounded-tr-none"
                          : "bg-[#202c33] text-[#e9edef] rounded-tl-none border border-[#2a3942]"
                      }`}
                    >
                      <div className="whitespace-pre-line leading-relaxed">
                        {m.text}
                      </div>

                      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                        <span>{m.timestamp}</span>
                        {m.sender === "user" && (
                          <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Interactive Shortcuts for Quick Testing */}
                {session?.currentStep === "WELCOME" && (
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => triggerAction({ text: "Yes", selectedId: "BTN_482_YES" })}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-sm"
                    >
                      👉 Yes, Interested in 482 Visa
                    </button>
                    <button
                      onClick={() => triggerAction({ text: "No", selectedId: "BTN_482_NO" })}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-sm transition border border-slate-700"
                    >
                      Not Right Now
                    </button>
                  </div>
                )}

                {session?.currentStep === "AWAITING_EMAIL" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => triggerAction({ text: "john.candidate@gmail.com" })}
                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs text-emerald-400 rounded-lg border border-emerald-500/30 font-mono"
                    >
                      Quick Fill: john.candidate@gmail.com
                    </button>
                  </div>
                )}

                {session?.currentStep === "VIDEO_SENT_AWAITING_INTEREST" && (
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => triggerAction({ text: "Book Consultation", selectedId: "BTN_CONSULT_YES" })}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-sm"
                    >
                      📅 Book Free Consultation with Abhay
                    </button>
                    <button
                      onClick={() => triggerAction({ text: "Maybe Later", selectedId: "BTN_CONSULT_NO" })}
                      className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-sm transition border border-slate-700"
                    >
                      Maybe Later
                    </button>
                  </div>
                )}

                {session?.currentStep === "SELECTING_DAY" && (() => {
                  const now = new Date();
                  const day = now.getDay();
                  const satOffset = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
                  const sunOffset = day === 6 ? 1 : day === 0 ? 0 : 7 - day;
                  const sat = new Date(now.getTime() + satOffset * 86400000);
                  const sun = new Date(now.getTime() + sunOffset * 86400000);
                  const satISO = sat.toISOString().split("T")[0];
                  const sunISO = sun.toISOString().split("T")[0];
                  const satLabel = sat.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });
                  const sunLabel = sun.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });

                  return (
                    <div className="flex flex-col gap-2 pt-2">
                      <span className="text-xs text-slate-400 font-medium text-center">
                        Choose Consultation Weekend Day:
                      </span>
                      <button
                        onClick={() => triggerAction({ selectedId: `DAY_SELECT_${satISO}`, text: `${satLabel} Consultation` })}
                        className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-xl text-sm border border-emerald-500/30 text-left flex items-center justify-between"
                      >
                        <span>{satLabel} Consultation</span>
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => triggerAction({ selectedId: `DAY_SELECT_${sunISO}`, text: `${sunLabel} Consultation` })}
                        className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-xl text-sm border border-emerald-500/30 text-left flex items-center justify-between"
                      >
                        <span>{sunLabel} Consultation</span>
                        <Calendar className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })()}

                {session?.currentStep === "SELECTING_SLOT" && (
                  <div className="flex flex-col gap-2 pt-2">
                    <span className="text-xs text-slate-400 font-medium text-center">
                      Available Slots strictly 11am-7pm IST ({session?.timeZoneLabel}):
                    </span>
                    <button
                      onClick={() =>
                        triggerAction({
                          selectedId: "SLOT_2026-09-27_16:00_11:30",
                          text: "Booked 11:30 AM (Nigeria WAT)",
                        })
                      }
                      className="w-full py-2.5 px-3 bg-emerald-950 border border-emerald-600 hover:bg-emerald-900/60 rounded-xl text-xs text-left flex items-center justify-between transition"
                    >
                      <div>
                        <div className="font-bold text-white">11:30 AM - 12:00 PM ({session?.countryName})</div>
                        <div className="text-[10px] text-emerald-300">Indian Time: 04:00 PM IST (with Abhay)</div>
                      </div>
                      <Clock className="w-4 h-4 text-emerald-400" />
                    </button>

                    <button
                      onClick={() =>
                        triggerAction({
                          selectedId: "SLOT_2026-09-27_16:30_12:00",
                          text: "Booked 12:00 PM (Nigeria WAT)",
                        })
                      }
                      className="w-full py-2.5 px-3 bg-emerald-950 border border-emerald-600 hover:bg-emerald-900/60 rounded-xl text-xs text-left flex items-center justify-between transition"
                    >
                      <div>
                        <div className="font-bold text-white">12:00 PM - 12:30 PM ({session?.countryName})</div>
                        <div className="text-[10px] text-emerald-300">Indian Time: 04:30 PM IST (with Abhay)</div>
                      </div>
                      <Clock className="w-4 h-4 text-emerald-400" />
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="bg-[#202c33] p-3 border-t border-[#2a3942] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask any visa question or enter email..."
                  className="flex-1 bg-[#2a3942] text-white placeholder-slate-400 text-sm px-4 py-2.5 rounded-full outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={loading || !inputMessage.trim()}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live State Inspector & Meeting Monitor */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* Country & Phone Switcher Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-emerald-400" />
                Select Candidate Phone & Country
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Switch candidate country dial codes to verify slot time conversion:
              </p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {PRESET_NUMBERS.map((p) => (
                  <button
                    key={p.phone}
                    onClick={() => {
                      setPhone(p.phone);
                      setCandidateName(`${p.name} Candidate`);
                      setMessages([]);
                      setSession(null);
                      toast.success(`Switched to ${p.name}`);
                      triggerAction({ text: "Hi" });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition ${
                      phone === p.phone
                        ? "bg-emerald-950 border-emerald-500 text-emerald-200"
                        : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span>
                      {p.flag} {p.name}
                    </span>
                    <span className="text-[10px] text-slate-400">+{p.phone.slice(0, 3)}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Custom Phone Number"
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 text-xs px-3 py-2 rounded-xl outline-none"
                />
                <button
                  onClick={() => triggerAction({ text: "Hi" })}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
                >
                  Start
                </button>
              </div>
            </div>

            {/* Live Session & Lead Inspector */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                Live CRM Session State & Assignment
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Current Step:</span>
                  <span className="font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    {session?.currentStep || "INITIALIZING"}
                  </span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Detected Country:</span>
                  <span className="font-semibold text-slate-200">
                    {session?.countryName || "Detecting..."} ({session?.countryCode})
                  </span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Candidate Timezone:</span>
                  <span className="font-semibold text-sky-400">
                    {session?.timeZoneLabel || "Pending..."}
                  </span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Registered Email:</span>
                  <span className="font-mono text-emerald-300">
                    {session?.email || "Not shared yet"}
                  </span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Linked CRM Lead:</span>
                  {session?.leadId ? (
                    <a
                      href={`/dashboard/leads/${session.leadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      #{session.leadId} View Lead <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-500">Auto-created on email entry</span>
                  )}
                </div>

                {session?.bookedSlot && (
                  <div className="p-3.5 bg-emerald-950/40 border border-emerald-600/50 rounded-xl space-y-2">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      Consultation Booked with Abhay!
                    </div>
                    <div className="text-slate-200">
                      📅 Date: <span className="font-semibold">{session.bookedSlot.date}</span>
                    </div>
                    <div className="text-slate-200">
                      ⏰ Candidate Local Time:{" "}
                      <span className="font-bold text-white">{session.bookedSlot.candidateTimeLabel}</span>
                    </div>
                    <div className="text-emerald-400">
                      🇮🇳 Indian Time:{" "}
                      <span className="font-bold">{session.bookedSlot.istTimeLabel}</span>
                    </div>
                    <div className="text-indigo-300 font-medium">
                      👤 Assigned Consultant: <span className="font-bold">{session.bookedSlot.meetingUserName || "Abhay"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Static Google Meet Configuration */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-400" />
                Permanent Static Google Meet Link
              </h3>
              <p className="text-xs text-slate-400">
                Delivered in all WhatsApp confirmations and reminders:
              </p>
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 truncate flex items-center justify-between">
                <span>{process.env.GOOGLE_MEET_LINK || "https://meet.google.com/tms-visa-consultation"}</span>
                <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">Fixed Room</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
