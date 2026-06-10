"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface AssignLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  leadId: number;
  currentAssigneeId: number | null;
}

interface User {
  id: number;
  name: string;
  username?: string;
  email?: string;
  role: string;
}

export default function AssignLeadModal({
  isOpen,
  onClose,
  onSuccess,
  leadId,
  currentAssigneeId,
}: AssignLeadModalProps) {
  const [assignedTo, setAssignedTo] = useState<number | null>(currentAssigneeId);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState<
    { startTime: string; available: boolean }[]
  >([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAssignedTo(null);
      fetchUsers();
      setSearchTerm("");
      setShowDropdown(false);
      setMeetingDate("");
      setStartTime("");
      setAvailableSlots([]);
    }
  }, [isOpen, currentAssigneeId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) {
        const data = await res.json();
        const allUsers = (data.users || []).filter((user: User) =>
          ["admin", "employee", "meeting"].includes(user.role),
        );
        setUsers(allUsers);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const filteredUsers = users.filter((emp) =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedUser = users.find((emp) => emp.id === assignedTo);
  const isMeetingUser = selectedUser?.role === "meeting";

  useEffect(() => {
    setStartTime("");
    setAvailableSlots([]);
    if (assignedTo && meetingDate && isMeetingUser) {
      fetchAvailableSlots(assignedTo, meetingDate);
    }
  }, [assignedTo, meetingDate, isMeetingUser]);

  const handleSelectUser = (userId: number) => {
    setAssignedTo(userId);
    setShowDropdown(false);
    const selected = users.find((e) => e.id === userId);
    setSearchTerm(selected ? selected.name : "");
    if (selected?.role !== "meeting") {
      setMeetingDate("");
      setStartTime("");
      setAvailableSlots([]);
    }
  };

  const handleClearSelection = () => {
    setAssignedTo(null);
    setSearchTerm("");
    setMeetingDate("");
    setStartTime("");
    setAvailableSlots([]);
  };

  const fetchAvailableSlots = async (userId: number, date: string) => {
    try {
      const res = await fetch(
        `/api/meetings/available-slots?meetingUserId=${userId}&meetingDate=${date}`,
      );
      if (res.ok) {
        const data = await res.json();
        setAvailableSlots(data.slots.filter((slot: any) => slot.available));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (assignedTo === null) {
      toast.error("Please select a user");
      return;
    }

    const selectedUser = users.find((emp) => emp.id === assignedTo);
    const userName = selectedUser?.name || "Unknown";

    if (isMeetingUser && (!meetingDate || !startTime)) {
      toast.error("Please select meeting date and slot");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, assignedTo, meetingDate, startTime }),
      });

      const data = await res.json();

      if (res.ok) {
        const action = currentAssigneeId ? "reassigned" : "assigned";
        toast.success(`Lead ${action} to ${userName}`);
        onSuccess();
        onClose();
      } else {
        toast.error(data.message || "Failed to assign lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case "admin":   return "bg-red-100 text-red-700";
      case "meeting": return "bg-purple-100 text-purple-700";
      default:        return "bg-blue-100 text-blue-700";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {currentAssigneeId ? "Reassign Lead" : "Assign Lead"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Select a user to assign this lead to
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Assign To */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Assign To <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal text-xs ml-1">
                (Admin / Employee / Meeting)
              </span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search users..."
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition text-gray-900 bg-white placeholder:text-gray-400 pr-10"
              />
              {assignedTo ? (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && filteredUsers.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border-2 border-gray-100 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                {filteredUsers.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleSelectUser(emp.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition border-b border-gray-50 last:border-b-0 ${
                      assignedTo === emp.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {emp.name}
                        </div>
                        {emp.email && (
                          <div className="text-xs text-gray-500 truncate">{emp.email}</div>
                        )}
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleBadgeClass(emp.role)}`}>
                        {emp.role}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && searchTerm && filteredUsers.length === 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border-2 border-gray-100 rounded-xl shadow-xl p-4 text-center">
                <p className="text-sm text-gray-500">No users found</p>
              </div>
            )}

            {/* Selected user chip */}
            {selectedUser && !showDropdown && (
              <div className="mt-2 px-4 py-3 bg-blue-50 rounded-xl border-2 border-blue-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{selectedUser.name}</div>
                  {selectedUser.email && (
                    <div className="text-xs text-gray-500 truncate">{selectedUser.email}</div>
                  )}
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleBadgeClass(selectedUser.role)}`}>
                  {selectedUser.role}
                </span>
              </div>
            )}
          </div>

          {/* Meeting Date — only for meeting users */}
          {isMeetingUser && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Meeting Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={meetingDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setMeetingDate(e.target.value);
                  setStartTime("");
                }}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white text-gray-900 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          )}

          {/* Available Slots — only when meeting user + date selected */}
          {isMeetingUser && meetingDate && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Available Slot <span className="text-red-500">*</span>
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white text-gray-900 focus:outline-none focus:border-blue-500 transition"
              >
                <option value="">Select a time slot</option>
                {availableSlots.length === 0 && (
                  <option disabled>No slots available</option>
                )}
                {availableSlots.map((slot) => (
                  <option key={slot.startTime} value={slot.startTime}>
                    {slot.startTime}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-5 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-700 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? "Assigning..." : currentAssigneeId ? "Reassign" : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}