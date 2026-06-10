"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface User {
  id: number;
  name: string;
  role: string;
  email?: string;
}

export default function CreateLeadModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateLeadModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [passportType, setPassportType] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [jobApplied, setJobApplied] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("new-lead");
  const [assignedTo, setAssignedTo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current user
  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
      fetchUsers();
      setSearchTerm("");
      setShowDropdown(false);
      setName("");
      setPhone("");
      setDueDate("");
      setState("");
      setCity("");
      setAge("");
      setPassportType("");
      setLeadSource("");
      setJobApplied("");
      setNote("");
      setStatus("new-lead");
    }
  }, [isOpen]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const userData = await res.json();
        // API returns user data directly, not nested under 'user'
        if (userData && userData.id) {
          setCurrentUser(userData);
          // If users, set their name in search term for display
          if (userData.role === "employee" || userData.role === "meeting") {
            setSearchTerm(userData.name);
            setAssignedTo(userData.id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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
        // Filter to show users
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

  const handleSelectUser = (userId: number) => {
    setAssignedTo(userId);
    setShowDropdown(false);
    const emp = users.find((e) => e.id === userId);
    setSearchTerm(emp ? emp.name : "");
  };

  const handleClearSelection = () => {
    setAssignedTo(null);
    setSearchTerm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          dueDate: dueDate || undefined,
          state: state || undefined,
          city: city || undefined,
          age: age ? parseInt(age) : undefined,
          passportType: passportType || undefined,
          leadSource: leadSource || undefined,
          jobApplied: jobApplied || undefined,
          note: note.trim() || undefined,
          status,
          assignedTo: assignedTo || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("Lead created successfully");
        setName("");
        setPhone("");
        setDueDate("");
        setState("");
        setCity("");
        setAge("");
        setPassportType("");
        setLeadSource("");
        setJobApplied("");
        setNote("");
        setStatus("new-lead");
        if (
          currentUser?.role === "employee" ||
          currentUser?.role === "meeting"
        ) {
          setAssignedTo(currentUser.id);
          setSearchTerm(currentUser.name);
        } else {
          setAssignedTo(null);
          setSearchTerm("");
        }
        onSuccess();
        onClose();
      } else {
        toast.error(data.message || "Failed to create lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Create New Lead
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl leading-none transition"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Candidate Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter candidate name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  setPhone(value);
                }}
                placeholder="1234567890"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
                required
              />
            </div>

            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Assign To (Admin / Employee / Meeting)
              </label>

              {currentUser?.role === "employee" ||
              currentUser?.role === "meeting" ? (
                // Employee view - show their name as assigned, read-only
                <div className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg text-gray-700">
                  <div className="flex items-center justify-between">
                    <span>{currentUser.name}</span>
                    <span className="text-xs text-gray-500">(You)</span>
                  </div>
                </div>
              ) : (
                // Admin view - show searchable dropdown
                <>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400 pr-10"
                    />
                    {assignedTo && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  {showDropdown && filteredUsers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredUsers.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => handleSelectUser(emp.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition border-b border-gray-100 last:border-b-0 ${
                            assignedTo === emp.id ? "bg-blue-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{emp.name}</span>

                            <span className="text-xs px-2 py-1 rounded bg-gray-100">
                              {emp.role}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {emp.email}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {showDropdown && searchTerm && filteredUsers.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                      <p className="text-gray-500 text-center">
                        No users found
                      </p>
                    </div>
                  )}

                  {selectedUser && !showDropdown && (
                    <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {selectedUser.name}
                          </div>
                          <div className="text-xs text-gray-600">
                            {selectedUser.email}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Enter state"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter city"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Age
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Enter age"
                min="1"
                max="120"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Passport Type
              </label>
              <select
                value={passportType}
                onChange={(e) => setPassportType(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900"
              >
                <option value="">Select passport type</option>
                <option value="ECR">ECR</option>
                <option value="NECR">NECR</option>
                <option value="NA">NA</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Lead Source
              </label>
              <input
                type="text"
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                placeholder="Enter lead source"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Job Applied
              </label>
              <input
                type="text"
                value={jobApplied}
                onChange={(e) => setJobApplied(e.target.value)}
                placeholder="Enter job applied"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Lead Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900"
              >
                <option value="new-lead">New Lead</option>
                <option value="call-back">Call Back</option>
                <option value="not-answering">Not Answering</option>
                <option value="meeting-scheduled">Meeting Scheduled</option>
                <option value="not-interested">Not Interested</option>
                <option value="wrong-number">Wrong Number</option>
                <option value="document-pending">Document Pending</option>
                <option value="payment-pending">Payment Pending</option>
                <option value="sales">Sales</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900"
              />
            </div>
            {/* Initial Note */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Note
              </label>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Enter note here..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-5 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? "Creating..." : "Create Lead"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
