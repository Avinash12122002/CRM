"use client";

import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Copy, Check, X, ShieldAlert } from "lucide-react";

interface OtpItem {
  id: string;
  phone: string;
  sender: string;
  code: string;
  receivedAt: string;
}

interface IncomingMessage {
  phone: string;
  senderName: string;
  textBody: string;
  msgType: string;
  createdAt: string;
}

export default function WhatsAppOtpModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [otps, setOtps] = useState<OtpItem[]>([]);
  const [recentMsgs, setRecentMsgs] = useState<IncomingMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchOtps = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/otp");
      if (res.ok) {
        const data = await res.json();
        setOtps(data.latestOtps || []);
        setRecentMsgs(data.recentIncomingMessages || []);
      }
    } catch (err) {
      console.error("Failed to load OTPs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOtps();
      // Poll every 3 seconds while modal is open to catch live incoming OTP from Instagram
      const interval = setInterval(fetchOtps, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    // Extract numbers if any (e.g. 5 or 6 digit code)
    const match = text.match(/\b\d{4,8}\b/);
    const codeToCopy = match ? match[0] : text;
    navigator.clipboard.writeText(codeToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                WhatsApp Verification & OTP
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Live OTP codes received for Instagram / Meta Ads
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchOtps}
              className={`p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition ${
                loading ? "animate-spin" : ""
              }`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4">
          {/* Quick Info Box */}
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">How to get your Instagram code:</span> Tap &quot;Send Code&quot; in Instagram. The OTP arrives here instantly (this window auto-refreshes every 3 seconds).
            </div>
          </div>

          {/* Latest OTP List */}
          {otps.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Latest Received OTPs
              </h3>
              {otps.map((item) => {
                const codeMatch = item.code.match(/\b\d{4,8}\b/);
                const displayDigits = codeMatch ? codeMatch[0] : null;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      {displayDigits && (
                        <div className="font-mono text-2xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                          {displayDigits}
                        </div>
                      )}
                      <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                        {item.code}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Received: {new Date(item.receivedAt).toLocaleTimeString()} ({new Date(item.receivedAt).toLocaleDateString()})
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopy(item.code, item.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 px-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                <KeyRound className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No OTPs received yet
              </p>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Trigger the verification code from Instagram or Meta Ads, and it will appear here automatically.
              </p>
            </div>
          )}

          {/* Raw Incoming Messages (Audit backup) */}
          {recentMsgs.length > 0 && (
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Recent Incoming WhatsApp Logs
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {recentMsgs.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 text-xs flex justify-between items-center"
                  >
                    <div className="truncate max-w-[320px]">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {m.senderName || m.phone}:
                      </span>{" "}
                      <span className="text-zinc-600 dark:text-zinc-400">{m.textBody || `[${m.msgType}]`}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
