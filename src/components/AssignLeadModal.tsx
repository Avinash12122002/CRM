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
  const [assignedTo, setAssignedTo] = useState<number | null>(
    currentAssigneeId,
  );
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAssignedTo(currentAssigneeId);
      fetchUsers();
      setSearchTerm("");
      setShowDropdown(false);
    }
  }, [isOpen, currentAssigneeId]);

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
        // Filter to users
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
    const selected = users.find((e) => e.id === userId);
    setSearchTerm(selected ? selected.name : "");
  };

  const handleClearSelection = () => {
    setAssignedTo(null);
    setSearchTerm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (assignedTo === null) {
      toast.error("Please select a user");
      return;
    }

    const selectedUser = users.find((emp) => emp.id === assignedTo);
    const userName = selectedUser?.name || "Unknown";

    setLoading(true);
    try {
      const res = await fetch("/api/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          assignedTo,
        }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {currentAssigneeId ? "Reassign Lead" : "Assign Lead"}
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
            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Assign To <span className="text-red-500">*</span>
                <span className="text-gray-500 font-normal text-xs ml-1">
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
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto ">
                  {filteredUsers.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleSelectUser(emp.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition border-b border-gray-100 last:border-b-0 ${
                        assignedTo === emp.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            {emp.name}
                          </div>

                          <div className="text-sm text-gray-600">
                            {emp.email}
                          </div>
                        </div>

                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            emp.role === "admin"
                              ? "bg-red-100 text-red-700"
                              : emp.role === "meeting"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {emp.role}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && searchTerm && filteredUsers.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                  <p className="text-gray-500 text-center">No users found</p>
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
                      <div className="text-xs text-blue-600 font-medium capitalize">
                        {selectedUser.role}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                {loading ? "Assigning..." : "Assign"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
