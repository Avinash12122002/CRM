"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Search,
  RefreshCw,
  ChevronDown,
  X,
  ExternalLink,
  CheckCheck,
  User,
  Bot,
  Calendar,
} from "lucide-react";

interface ConversationItem {
  phone: string;
  name: string;
  email?: string | null;
  countryName?: string;
  currentStep?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastSender?: "candidate" | "admin" | "bot";
  unreadCount?: number;
  bookedSlot?: {
    date?: string;
    candidateTimeLabel?: string;
    istTimeLabel?: string;
    meetingUserName?: string;
  } | null;
}

interface WhatsAppNavbarDropdownProps {
  isActive: boolean;
  auUnreadCount: number;
  ieUnreadCount: number;
}

export default function WhatsAppNavbarDropdown({
  isActive,
  auUnreadCount: initialAuUnread,
  ieUnreadCount: initialIeUnread,
}: WhatsAppNavbarDropdownProps) {
  const pathname = usePathname() || "";
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [countryTab, setCountryTab] = useState<"AU" | "IE">("AU");

  const [auConversations, setAuConversations] = useState<ConversationItem[]>([]);
  const [ieConversations, setIeConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [auUnreadCount, setAuUnreadCount] = useState(initialAuUnread || 0);
  const [ieUnreadCount, setIeUnreadCount] = useState(initialIeUnread || 0);

  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (pathname.startsWith("/dashboard/whatsapp-ireland")) {
      setCountryTab("IE");
    }
  }, [pathname]);

  const fetchAustraliaConversations = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/conversations");
      if (res.ok) {
        const data = await res.json();
        const list: ConversationItem[] = Array.isArray(data?.conversations) ? data.conversations : [];
        setAuConversations(list);

        const count = list.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
        setAuUnreadCount(count);
      }
    } catch (err) {
      console.error("Failed to load AU WhatsApp conversations in navbar:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const fetchIrelandConversations = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/whatsapp-ireland/conversations");
      if (res.ok) {
        const data = await res.json();
        const list: ConversationItem[] = Array.isArray(data?.conversations) ? data.conversations : [];
        setIeConversations(list);

        const count = list.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
        setIeUnreadCount(count);
      }
    } catch (err) {
      console.error("Failed to load IE WhatsApp conversations in navbar:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const fetchAllConversations = async (showSpinner = false) => {
    await Promise.all([
      fetchAustraliaConversations(showSpinner),
      fetchIrelandConversations(showSpinner),
    ]);
  };

  // Poll for new messages every 12 seconds
  useEffect(() => {
    fetchAllConversations(true);
    const interval = setInterval(() => {
      fetchAllConversations(false);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // Calculate dropdown coordinates relative to trigger button
  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(440, window.innerWidth - 32);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - menuWidth - 16);
    }
    setCoords({
      top: rect.bottom + 6,
      left,
      width: menuWidth,
    });
  }, []);

  // Update position on open, resize, scroll
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleScrollOrResize = () => updateCoords();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, updateCoords]);

  // Current active list based on selected country tab
  const activeConversations = countryTab === "AU" ? auConversations : ieConversations;
  const currentUnreadCount = countryTab === "AU" ? auUnreadCount : ieUnreadCount;
  const totalUnreadCount = (auUnreadCount || 0) + (ieUnreadCount || 0);

  // Mark all active conversations as read
  const markAllAsRead = async () => {
    if (countryTab === "AU") {
      setAuConversations((prev) =>
        prev.map((c) => ({ ...c, unreadCount: 0 }))
      );
      setAuUnreadCount(0);

      try {
        await fetch("/api/whatsapp/conversations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAllRead: true }),
        });
      } catch (err) {
        console.error("Failed to mark AU WhatsApp conversations read:", err);
      }
    } else {
      setIeConversations((prev) =>
        prev.map((c) => ({ ...c, unreadCount: 0 }))
      );
      setIeUnreadCount(0);

      try {
        await fetch("/api/whatsapp-ireland/conversations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAllRead: true }),
        });
      } catch (err) {
        console.error("Failed to mark IE WhatsApp conversations read:", err);
      }
    }
  };

  // Filtered conversations based on search query
  const filteredConversations = (activeConversations || []).filter((item) => {
    if (!item) return false;
    const q = String(search || "").trim().toLowerCase();
    if (!q) return true;

    const phoneStr = String(item.phone || "").toLowerCase();
    const nameStr = String(item.name || "").toLowerCase();
    const msgStr = String(item.lastMessage || "").toLowerCase();
    return phoneStr.includes(q) || nameStr.includes(q) || msgStr.includes(q);
  });

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      if (isToday) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <>
      {/* Navbar WhatsApp Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              fetchAllConversations(true);
              setTimeout(updateCoords, 0);
            }
            return next;
          });
        }}
        className={`relative inline-flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors rounded-md ${
          isOpen || isActive
            ? "border-b-2 border-foreground text-zinc-900 dark:text-zinc-100 font-semibold"
            : "border-b-2 border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:border-zinc-300"
        }`}
        title="Candidate WhatsApp Live Chat (Australia & Ireland)"
      >
        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
        <span>WhatsApp</span>

        {/* Dynamic Total Unread Badge */}
        {totalUnreadCount > 0 && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none shadow-xs animate-in zoom-in duration-150">
            {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
          </span>
        )}

        <ChevronDown
          className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180 text-emerald-500" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Panel via Portal */}
      {isOpen && mounted && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 99999,
          }}
          className="max-h-[82vh] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
              <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                whatsapp/{countryTab === "AU" ? "australia" : "ireland"}/
              </span>
              <span className="text-[11px] font-sans text-zinc-400">
                ({activeConversations.length} cand)
              </span>
              {currentUnreadCount > 0 && (
                <span className="bg-emerald-500/15 text-emerald-500 text-[10px] font-semibold px-1.5 py-0.5 rounded font-sans border border-emerald-500/20">
                  {currentUnreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 font-sans">
              {currentUnreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="px-2 py-0.5 text-[11px] rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1 transition"
                  title="Mark active country chats as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchAllConversations(true)}
                disabled={loading}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                title="Refresh candidate chats"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Country Tabs: Australia 🇦🇺 vs Ireland 🇮🇪 */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-950/60 p-1.5 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setCountryTab("AU")}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                countryTab === "AU"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <span>🇦🇺 Australia</span>
              {auUnreadCount > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {auUnreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setCountryTab("IE")}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                countryTab === "IE"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <span>🇮🇪 Ireland</span>
              {ieUnreadCount > 0 && (
                <span className="bg-teal-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {ieUnreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder={`Search ${countryTab === "AU" ? "Australia" : "Ireland"} candidate, phone or message...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-200"
              />
            </div>
          </div>

          {/* Chat List Body */}
          <div className="p-3 overflow-y-auto flex-1 font-mono text-xs space-y-1.5 select-none">
            {loading && activeConversations.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                <p>Loading {countryTab === "AU" ? "Australia" : "Ireland"} candidate chats...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-400 font-sans">
                {search ? "No matching conversations found" : `No ${countryTab === "AU" ? "Australia" : "Ireland"} WhatsApp conversations found`}
              </div>
            ) : (
              filteredConversations.map((item, idx) => {
                const isUnread = (item.unreadCount || 0) > 0;
                const isLast = idx === filteredConversations.length - 1;
                const href =
                  countryTab === "AU"
                    ? `/dashboard/whatsapp?phone=${item.phone}`
                    : `/dashboard/whatsapp-ireland?phone=${item.phone}`;

                return (
                  <Link
                    key={item.phone}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex items-start justify-between px-2.5 py-2 rounded-xl transition font-sans ${
                      isUnread
                        ? "bg-emerald-50/70 dark:bg-emerald-950/25 border-l-2 border-emerald-500"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="text-zinc-400 text-[10px] font-mono mt-0.5">
                        {isLast ? "└─" : "├─"}
                      </span>
                      <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 text-[11px] font-bold">
                        {item.name ? item.name.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {item.name && item.name !== "Candidate" ? item.name : `+${item.phone}`}
                          </span>
                          {item.name && item.name !== "Candidate" && (
                            <span className="text-[10px] text-zinc-400 font-mono">
                              (+{item.phone})
                            </span>
                          )}
                        </div>

                        {/* Last message snippet */}
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {item.lastSender === "admin" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">You: </span>
                          ) : item.lastSender === "bot" ? (
                            <span className="text-blue-500 font-medium">Bot: </span>
                          ) : null}
                          {item.lastMessage || "No messages yet"}
                        </p>

                        {/* Step or Booking tag */}
                        {item.bookedSlot?.date ? (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            <span>Booked: {item.bookedSlot.date}</span>
                          </div>
                        ) : item.currentStep ? (
                          <span className="inline-block text-[9px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1 rounded mt-1">
                            {item.currentStep}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <span className="text-[10px] text-zinc-400">
                        {formatTime(item.lastMessageAt)}
                      </span>
                      {isUnread && (
                        <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-xs">
                          {item.unreadCount} new
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer: Open Full Chat Explorer */}
          <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between shrink-0 font-sans">
            <span className="text-[11px] text-zinc-400">
              Meta WhatsApp Cloud API Live
            </span>
            <Link
              href={countryTab === "AU" ? "/dashboard/whatsapp" : "/dashboard/whatsapp-ireland"}
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
            >
              <span>Full Chat {countryTab === "AU" ? "🇦🇺" : "🇮🇪"}</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
