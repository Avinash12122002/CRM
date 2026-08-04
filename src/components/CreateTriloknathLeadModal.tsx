"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface CreateTriloknathLeadModalProps {
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

export default function CreateTriloknathLeadModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTriloknathLeadModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [age, setAge] = useState("");
  const [passportType, setPassportType] = useState("");
  const [leadSource, setLeadSource] = useState("Triloknath Website");
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

  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
      fetchUsers();
      setSearchTerm("");
      setShowDropdown(false);
      setName("");
      setPhone("");
      setEmail("");
      setDueDate("");
      setState("");
      setCity("");
      setCountry("");
      setAge("");
      setPassportType("");
      setLeadSource("Triloknath Website");
      setJobApplied("");
      setNote("");
      setStatus("new-lead");
      setAssignedTo(null);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/leads/users");
      if (res.ok) {
        const data = await res.json();
        const allUsers = (data.users || []).filter((user: User) =>
          ["telecaller", "employee", "meeting"].includes(user.role),
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

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/triloknath/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email: email.trim() || undefined,
          dueDate: dueDate || undefined,
          state: state || undefined,
          city: city || undefined,
          country: country || undefined,
          age: age ? parseInt(age) : undefined,
          passportType: passportType || undefined,
          leadSource: leadSource || "Triloknath Website",
          jobApplied: jobApplied || undefined,
          note: note.trim() || undefined,
          status,
          assignedTo: assignedTo || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to create Triloknath lead");
        return;
      }

      toast.success("Triloknath Lead created successfully");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Failed to create Triloknath lead");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl max-w-xl w-full p-6 shadow-2xl my-8">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Create Triloknath Lead
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="Client Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Phone *
              </label>
              <input
                type="text"
                required
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Country
              </label>
              <input
                type="text"
                placeholder="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                State
              </label>
              <input
                type="text"
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                City
              </label>
              <input
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Age
              </label>
              <input
                type="number"
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Passport Type
              </label>
              <select
                value={passportType}
                onChange={(e) => setPassportType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select Passport</option>
                <option value="ECR">ECR</option>
                <option value="ECNR">ECNR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Job Applied
            </label>
            <input
              type="text"
              placeholder="Job Applied For"
              value={jobApplied}
              onChange={(e) => setJobApplied(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Assigned To User */}
          {currentUser?.role === "admin" && (
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Assign To Staff
              </label>
              <div
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 cursor-pointer flex justify-between items-center"
              >
                <span>{selectedUser ? selectedUser.name : "Unassigned"}</span>
                {assignedTo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearSelection();
                    }}
                    className="text-xs text-red-500 hover:underline ml-2"
                  >
                    Clear
                  </button>
                )}
              </div>
              {showDropdown && (
                <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 space-y-2">
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className={`px-2 py-1.5 text-xs rounded-md cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                          assignedTo === u.id
                            ? "bg-blue-100 dark:bg-blue-900/50 font-bold text-blue-800 dark:text-blue-200"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {u.name} <span className="text-[10px] text-gray-400">({u.role})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Initial Note
            </label>
            <textarea
              rows={2}
              placeholder="Add an initial note for this lead..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {loading ? "Creating..." : "Save Triloknath Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
