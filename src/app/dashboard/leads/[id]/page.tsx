
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee" | "meeting";
}

interface HistoryEntry {
  action: string;
  performedBy: number;
  performedByName: string;
  timestamp: string;
  previousAssignee?: number;
  previousAssigneeName?: string;
  newAssignee?: number;
  newAssigneeName?: string;
  assignedTo?: number;
  assignedToName?: string;
  details?: string;
  oldStatus?: string;
  newStatus?: string;
  performedByRole?: string;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  state?: string;
  city?: string;
  age?: number;
  passportType?: string;
  leadSource?: string;
  jobApplied?: string;
  status: string;
  dueDate?: string;
  assignedTo: number | null;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToRole?: string;
  assignedBy?: number;
  assignedByName?: string;
  assignedByRole?: string;
  meetingStatus?: string;
  meetingDetails?: {
    meetingUserId?: number;
    meetingUserName?: string;
    meetingDate?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  };
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
}

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [movingToAdmin, setMovingToAdmin] = useState(false);

  const [adminUsers, setAdminUsers] = useState<{ id: number; name: string }[]>([]);
  const showAssignSection =
    user &&
    lead &&
    (user.role === "employee" || user.role === "meeting") &&
    lead.assignedTo === user.id;

  const [meetingUsers, setMeetingUsers] = useState<User[]>([]);
  const [employeeUsers, setEmployeeUsers] = useState<User[]>([]);

  const [selectedMeetingDate, setSelectedMeetingDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<
    { startTime: string; available: boolean }[]
  >([]);

  const [showReschedule, setShowReschedule] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedAdminUser, setSelectedAdminUser] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    dueDate: "",
    state: "",
    city: "",
    age: "",
    passportType: "",
    leadSource: "",
    jobApplied: "",
    status: "",
  });

 
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const toastShownRef = useRef(false);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      fetchLead();
      fetchAdminUsers();
      fetchMeetingUsers();
      fetchEmployeeUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    setSelectedSlot("");
    setAvailableSlots([]);
    const isMeetingUser = meetingUsers.some(
      (m) => String(m.id) === String(selectedEmployee),
    );
    if (isMeetingUser && selectedEmployee && selectedMeetingDate) {
      fetchAvailableSlots(selectedEmployee, selectedMeetingDate);
    }
  }, [selectedEmployee, selectedMeetingDate, meetingUsers]);

  useEffect(() => {
    const isMeetingUser = meetingUsers.some(
      (m) => String(m.id) === String(selectedAdminUser),
    );
    if (isMeetingUser && selectedAdminUser && selectedMeetingDate) {
      fetchAvailableSlots(selectedAdminUser, selectedMeetingDate);
    }
  }, [selectedAdminUser, selectedMeetingDate, meetingUsers]);

  useEffect(() => {
    if (
      showReschedule &&
      lead?.meetingDetails?.meetingUserId &&
      selectedMeetingDate
    ) {
      fetchAvailableSlots(
        String(lead.meetingDetails.meetingUserId),
        selectedMeetingDate,
      );
    }
  }, [showReschedule, selectedMeetingDate, lead]);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        if (!toastShownRef.current) {
          toast.error("Please login first");
          toastShownRef.current = true;
        }
        router.push("/");
        return;
      }
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error(err);
      if (!toastShownRef.current) {
        toast.error("Something went wrong");
        toastShownRef.current = true;
      }
      router.push("/");
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch("/api/users/by-role?role=admin");
      const data = await res.json();
      setAdminUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMeetingUsers = async () => {
    try {
      const response = await fetch("/api/users/by-role?role=meeting");
      const data = await response.json();
      if (response.ok) setMeetingUsers(data.users || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchEmployeeUsers = async () => {
    try {
      const response = await fetch("/api/users/by-role?role=employee");
      const data = await response.json();
      if (response.ok) setEmployeeUsers(data.users || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setLead(data.lead);
        setSelectedStatus(data.lead.status || "");
        const dueDateValue = data.lead.dueDate
          ? new Date(data.lead.dueDate).toISOString().split("T")[0]
          : "";
        setEditForm({
          name: data.lead.name || "",
          phone: data.lead.phone || "",
          dueDate: dueDateValue,
          state: data.lead.state || "",
          city: data.lead.city || "",
          age: data.lead.age ? String(data.lead.age) : "",
          passportType: data.lead.passportType || "",
          leadSource: data.lead.leadSource || "",
          jobApplied: data.lead.jobApplied || "",
          status: data.lead.status || "",
        });
      } else if (res.status === 403) {
        router.push("/dashboard/leads");
      } else if (res.status === 404) {
        toast.error("Lead not found");
        router.push("/dashboard/leads");
      } else {
        toast.error("Failed to fetch lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async (meetingUserId: string, meetingDate: string) => {
    if (!meetingUserId || !meetingDate) {
      setAvailableSlots([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/meetings/available-slots?meetingUserId=${meetingUserId}&meetingDate=${meetingDate}`,
      );
      const data = await res.json();
      if (res.ok) setAvailableSlots(data.slots || []);
      else setAvailableSlots([]);
    } catch (err) {
      console.error(err);
      setAvailableSlots([]);
    }
  };

  const addNoteOnly = async () => {
    
    if (!note.trim()) {
      toast.error("Note cannot be empty");
      return;
    }
    setAddingNote(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (res.ok) {
        toast.success("Note added successfully");
        setNote("");
        await fetchLead();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to add note");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setAddingNote(false);
    }
  };

  const handleStatusUpdate = async (newStatus:string) => {
  setUpdatingStatus(true);

  try {
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: newStatus,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      toast.success("Status updated successfully");

      // Employee/Meeting -> Lead moved to Admin
      if (
          user?.role !== "admin" &&
          ["wrong-number", "not-interested", "sales"].includes(newStatus)
        ) {
          toast.success("Lead returned to Admin");

          window.location.href = "/dashboard/leads";

          return;
        }

      await fetchLead();
    } else {
      toast.error(
        data.message || "Failed to update status"
      );
    }
  } catch (err) {
    console.error(err);
    toast.error("Something went wrong");
  } finally {
    setUpdatingStatus(false);
  }
};

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (lead) {
      const dueDateValue = lead.dueDate
        ? new Date(lead.dueDate).toISOString().split("T")[0]
        : "";
      setEditForm({
        name: lead.name || "",
        phone: lead.phone || "",
        dueDate: dueDateValue,
        state: lead.state || "",
        city: lead.city || "",
        age: lead.age ? String(lead.age) : "",
        passportType: lead.passportType || "",
        leadSource: lead.leadSource || "",
        jobApplied: lead.jobApplied || "",
        status: lead.status || "",
      });
    }
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.phone.trim()) {
      toast.error("Phone is required");
      return;
    }
    setUpdating(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success("Lead updated successfully");
        setIsEditing(false);
        await fetchLead();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to update lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteLead = async () => {
    if (user?.role !== "admin") {
      toast.error("Only admin can delete leads");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this lead? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/delete`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Lead deleted successfully");
        router.push("/dashboard/leads");
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to delete lead");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    }
  };

  const handleMoveToAdmin = async () => {
    if (adminUsers.length === 0) { toast.error("No admin users available"); return; }
    if (!window.confirm("Are you sure you want to move this lead to admin?")) return;
    setMovingToAdmin(true);
    try {
      const adminId = adminUsers[0].id;
      const res = await fetch("/api/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: parseInt(leadId), assignedTo: adminId }),
      });
      if (res.ok) {
        toast.success("Lead moved to admin successfully");
        router.push("/dashboard/leads");
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to move lead to admin");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setMovingToAdmin(false);
    }
  };

  const handleAssignUser = async () => {
    if (!lead) { toast.error("Lead not found"); return; }
    if (!selectedEmployee) { toast.error("Please select a user"); return; }

    const isMeetingUser = meetingUsers.some(
      (m) => String(m.id) === String(selectedEmployee),
    );

    try {
      if (isMeetingUser) {
        if (!selectedMeetingDate) { toast.error("Please select meeting date"); return; }
        if (!selectedSlot) { toast.error("Please select time slot"); return; }
        const response = await fetch("/api/meetings/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            meetingUserId: Number(selectedEmployee),
            meetingDate: selectedMeetingDate,
            startTime: selectedSlot,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        toast.success("Meeting booked successfully");
      } else {
        const response = await fetch("/api/leads/assign", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, assignedTo: Number(selectedEmployee) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        toast.success("Lead assigned successfully");
      }
      setSelectedEmployee("");
      setSelectedMeetingDate("");
      setSelectedSlot("");
      setAvailableSlots([]);
      router.push("/dashboard/leads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    }
  };

  const handleCompleteMeeting = async () => {
    if (!lead) return;
    if (!window.confirm("Are you sure you want to mark this meeting as completed?")) return;
    try {
      const res = await fetch("/api/meetings/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting completed");
      router.push("/dashboard/leads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete meeting");
    }
  };

  const handleRescheduleMeeting = async () => {
    if (!lead) return;
    const meetingUserId =
      selectedEmployee || String(lead.meetingDetails?.meetingUserId || "");
    if (!meetingUserId) { toast.error("Select meeting user"); return; }
    if (!selectedMeetingDate) { toast.error("Select meeting date"); return; }
    if (!selectedSlot) { toast.error("Select meeting slot"); return; }
    try {
      const res = await fetch("/api/meetings/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          meetingUserId: Number(meetingUserId),
          meetingDate: selectedMeetingDate,
          startTime: selectedSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting rescheduled");
      setSelectedEmployee("");
      setSelectedMeetingDate("");
      setSelectedSlot("");
      setAvailableSlots([]);
      setShowReschedule(false);
      router.push("/dashboard/leads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule meeting");
    }
  };

  const handleCancelMeeting = async () => {
    if (!lead) return;
    if (!window.confirm("Are you sure you want to cancel this meeting?")) return;
    try {
      const res = await fetch("/api/meetings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting cancelled");
      router.push("/dashboard/leads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel meeting");
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "new-lead": return "bg-blue-100 text-blue-800";
      case "call-back": return "bg-yellow-100 text-yellow-800";
      case "not-answering": return "bg-orange-100 text-orange-800";
      case "meeting-scheduled": return "bg-purple-100 text-purple-800";
      case "not-interested": return "bg-red-100 text-red-800";
      case "wrong-number": return "bg-pink-100 text-pink-800";
      case "document-pending": return "bg-indigo-100 text-indigo-800";
      case "payment-pending": return "bg-amber-100 text-amber-800";
      case "sales": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatHistoryAction = (entry: HistoryEntry) => {
    switch (entry.action) {
      case "created":
        return entry.assignedToName
          ? `Created and assigned to ${entry.assignedToName}`
          : "Created";
      case "assigned": return entry.details || "Lead assigned";
      case "unassigned": return entry.details || "Lead unassigned";
      case "note_added": return `Added note: "${entry.details}"`;
      case "status_updated": return entry.details || "Status updated";
      case "lead_updated": return entry.details || "Lead details updated";
      case "meeting_booked": return entry.details || "Meeting booked";
      case "meeting_rescheduled": return entry.details || "Meeting rescheduled";
      case "meeting_cancelled": return entry.details || "Meeting cancelled";
      case "meeting_completed": return entry.details || "Meeting completed";
      default: return entry.action;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <DashboardNavbar user={user} />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <p className="text-gray-600 dark:text-gray-400">Loading lead details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">

          {/* Back button */}
          <button
            onClick={() => router.push("/dashboard/leads")}
            className="mb-6 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2 font-medium transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Leads
          </button>

          {/* Lead Details Card */}
          <div className="bg-white shadow-lg rounded-xl p-8 mb-6 border border-gray-100">
            {!isEditing ? (
              <>
                {/* ─── HEADER: name + action buttons ONLY ─── */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">{lead.name}</h1>
                  </div>

                  {/* Action buttons — status badge, edit, delete, move-to-admin ONLY */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`px-4 py-2 text-sm font-bold rounded-full uppercase tracking-wide ${getStatusBadgeColor(lead.status)}`}
                    >
                      {lead.status}
                    </span>

                    {(user.role === "admin" ||
                      ((user.role === "employee" || user.role === "meeting") &&
                        lead.assignedTo === user.id)) && (
                      <button
                        onClick={handleEditClick}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    )}

                    {user.role === "admin" && (
                      <button
                        onClick={handleDeleteLead}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    )}

                    {user.role !== "admin" && lead.assignedTo === user.id && (
                      <div className="relative group">
                        <button
                          onClick={handleMoveToAdmin}
                          disabled={movingToAdmin || lead.assignedToRole === "admin"}
                          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          {movingToAdmin ? "Moving..." : "Move To Admin"}
                        </button>
                        {lead.assignedToRole === "admin" && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Already assigned to admin
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* ─── END HEADER ─── */}

                {/* ─── EMPLOYEE / MEETING: Assign User Section ─── */}
                {showAssignSection && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Assign / Transfer</h3>
                    <div className="flex flex-wrap gap-3 items-end">
                      <select
                        value={selectedEmployee}
                        onChange={(e) => {
                          setSelectedEmployee(e.target.value);
                          setSelectedMeetingDate("");
                          setSelectedSlot("");
                          setAvailableSlots([]);
                        }}
                        className="border-2 border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select User</option>
                        {employeeUsers
                          .filter((e) => e.id !== lead.assignedTo)
                          .map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              👨‍💼 Employee — {employee.name}
                            </option>
                          ))}
                        {meetingUsers
                          .filter((m) => m.id !== lead.assignedTo)
                          .map((meeting) => (
                            <option key={meeting.id} value={meeting.id}>
                              📅 Meeting — {meeting.name}
                            </option>
                          ))}
                      </select>

                      {meetingUsers.some((m) => String(m.id) === String(selectedEmployee)) && (
                        <>
                          <input
                            type="date"
                            value={selectedMeetingDate}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={(e) => {
                              setSelectedMeetingDate(e.target.value);
                              setSelectedSlot("");
                            }}
                            className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-500"
                          />

                          {selectedMeetingDate && (
                            <select
                              value={selectedSlot}
                              onChange={(e) => setSelectedSlot(e.target.value)}
                              className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-500"
                            >
                              <option value="">Select Time Slot</option>
                              {availableSlots
                                .filter((slot) => slot.available)
                                .map((slot) => (
                                  <option key={slot.startTime} value={slot.startTime}>
                                    {slot.startTime}
                                  </option>
                                ))}
                            </select>
                          )}

                          {selectedMeetingDate && selectedSlot && (
                            <button
                              type="button"
                              onClick={handleAssignUser}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
                            >
                              {user.role === "meeting" ? "Transfer Meeting" : "Book Meeting"}
                            </button>
                          )}
                        </>
                      )}

                      {!meetingUsers.some((m) => String(m.id) === String(selectedEmployee)) &&
                        selectedEmployee && (
                          <button
                            type="button"
                            onClick={handleAssignUser}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
                          >
                            Assign User
                          </button>
                        )}
                    </div>
                  </div>
                )}

                {/* ─── ADMIN: Assign User Section ─── */}
                {user.role === "admin" && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Assign Lead</h3>
                    <div className="flex flex-wrap gap-3 items-end">
                      <select
                        value={selectedAdminUser}
                        onChange={(e) => {
                          setSelectedAdminUser(e.target.value);
                          setSelectedMeetingDate("");
                          setSelectedSlot("");
                          setAvailableSlots([]);
                        }}
                        className="border-2 border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:border-green-500"
                      >
                        <option value="">Select User</option>
                        {employeeUsers
                          .filter((e) => e.id !== lead.assignedTo)
                          .map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              👨‍💼 Employee — {employee.name}
                            </option>
                          ))}
                        {meetingUsers
                          .filter((m) => m.id !== lead.assignedTo)
                          .map((meeting) => (
                            <option key={meeting.id} value={meeting.id}>
                              📅 Meeting — {meeting.name}
                            </option>
                          ))}
                      </select>

                      {selectedAdminUser &&
                        meetingUsers.find((m) => m.id === Number(selectedAdminUser)) && (
                          <>
                            <input
                              type="date"
                              value={selectedMeetingDate}
                              min={new Date().toISOString().split("T")[0]}
                              onChange={(e) => {
                                setSelectedMeetingDate(e.target.value);
                                setSelectedSlot("");
                              }}
                              className="border-2 border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:border-green-500"
                            />

                            {selectedMeetingDate && (
                              <select
                                value={selectedSlot}
                                onChange={(e) => setSelectedSlot(e.target.value)}
                                className="border-2 border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:border-green-500"
                              >
                                <option value="">Select Time Slot</option>
                                {availableSlots
                                  .filter((slot) => slot.available)
                                  .map((slot) => (
                                    <option key={slot.startTime} value={slot.startTime}>
                                      {slot.startTime}
                                    </option>
                                  ))}
                              </select>
                            )}

                            {selectedMeetingDate && selectedSlot && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!lead) return;
                                  try {
                                    const response = await fetch("/api/meetings/book", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        leadId: lead.id,
                                        meetingUserId: Number(selectedAdminUser),
                                        meetingDate: selectedMeetingDate,
                                        startTime: selectedSlot,
                                      }),
                                    });
                                    const data = await response.json();
                                    if (!response.ok) throw new Error(data.message || "Failed to book meeting");
                                    toast.success("Meeting booked successfully");
                                    setSelectedAdminUser("");
                                    setSelectedMeetingDate("");
                                    setSelectedSlot("");
                                    setAvailableSlots([]);
                                    router.push("/dashboard/leads");
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Booking failed");
                                  }
                                }}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-medium"
                              >
                                Book Meeting
                              </button>
                            )}
                          </>
                        )}

                      {selectedAdminUser &&
                        !meetingUsers.find((m) => m.id === Number(selectedAdminUser)) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!lead) return;
                              try {
                                const response = await fetch("/api/leads/assign", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    leadId: lead.id,
                                    assignedTo: Number(selectedAdminUser),
                                  }),
                                });
                                const data = await response.json();
                                if (!response.ok) throw new Error(data.message || "Assignment failed");
                                toast.success("Lead assigned successfully");
                                setSelectedAdminUser("");
                                router.push("/dashboard/leads");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Assignment failed");
                              }
                            }}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
                          >
                            Assign User
                          </button>
                        )}
                    </div>
                  </div>
                )}

                {/* ─── MEETING DETAILS CARD ─── */}
                {lead.meetingDetails &&
                  (user.role === "admin" ||
                    lead.assignedTo === user.id ||
                    lead.createdBy === user.id) && (
                    <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
                      <h3 className="font-bold text-purple-800 mb-3">Meeting Details</h3>
                      <div className="grid grid-cols-2 gap-3 text-base text-gray-900">
                        <div><strong>User:</strong> {lead.meetingDetails.meetingUserName}</div>
                        <div>
                          <strong>Status:</strong>{" "}
                          <span className="capitalize">{lead.meetingDetails.status}</span>
                        </div>
                        <div><strong>Date:</strong> {lead.meetingDetails.meetingDate}</div>
                        <div>
                          <strong>Time:</strong> {lead.meetingDetails.startTime} — {lead.meetingDetails.endTime}
                        </div>
                      </div>

                      {((user.role === "meeting" &&
                          user.id === lead.meetingDetails?.meetingUserId)) && (
                        <div className="flex gap-2 mt-4 flex-wrap">
                          {lead.meetingDetails.status !== "completed" && (
                            <button
                              onClick={() => {
                                setShowReschedule(true);
                                setSelectedEmployee(
                                  String(lead.meetingDetails?.meetingUserId || ""),
                                );
                                setSelectedMeetingDate(
                                  lead.meetingDetails?.meetingDate || "",
                                );
                                setSelectedSlot("");
                                fetchAvailableSlots(
                                  String(lead.meetingDetails?.meetingUserId),
                                  lead.meetingDetails?.meetingDate || "",
                                );
                              }}
                              className="bg-yellow-500 text-white px-3 py-2 rounded-lg hover:bg-yellow-600 font-medium"
                            >
                              Reschedule
                            </button>
                          )}
                          {lead.meetingDetails.status !== "cancelled" && (
                            <button
                              onClick={handleCancelMeeting}
                              className="bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 font-medium"
                            >
                              Cancel
                            </button>
                          )}
                          {lead.meetingDetails.status !== "completed" && (
                            <button
                              onClick={handleCompleteMeeting}
                              className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 font-medium"
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* ─── RESCHEDULE FORM (shown below meeting details) ─── */}
                {showReschedule && (
                  <div className="mb-6 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                    <h3 className="text-sm font-semibold text-yellow-800 mb-3">Reschedule Meeting</h3>
                    <div className="flex flex-wrap gap-3 items-end">
                      <input
                        type="date"
                        value={selectedMeetingDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => {
                          setSelectedMeetingDate(e.target.value);
                          setSelectedSlot("");
                        }}
                        className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-yellow-500"
                      />

                      {selectedMeetingDate && (
                        <select
                          value={selectedSlot}
                          onChange={(e) => setSelectedSlot(e.target.value)}
                          className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-yellow-500"
                        >
                          <option value="">Select Slot</option>
                          {availableSlots
                            .filter((slot) => slot.available)
                            .map((slot) => (
                              <option key={slot.startTime} value={slot.startTime}>
                                {slot.startTime}
                              </option>
                            ))}
                        </select>
                      )}

                      {selectedMeetingDate && selectedSlot && (
                        <button
                          onClick={handleRescheduleMeeting}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Confirm Reschedule
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowReschedule(false);
                          setSelectedMeetingDate("");
                          setSelectedSlot("");
                          setAvailableSlots([]);
                        }}
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── LEAD INFO GRID ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Phone</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.phone || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">State</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.state || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">City</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.city || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Age</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.age || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Passport Type</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.passportType || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Lead Source</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.leadSource || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Job Applied</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.jobApplied || "N/A"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Due Date</p>
                    <p className="text-gray-900 font-medium text-lg">
                      {lead.dueDate
                        ? new Date(lead.dueDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Assigned To</p>
                    <p className="text-gray-900 font-medium text-lg">
                      {lead.assignedToName || "Unassigned"}
                    </p>
                  </div>

                  {lead.meetingDetails && (
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold mb-1">Meeting</p>
                      <p className="text-gray-900 font-medium">{lead.meetingDetails.meetingUserName}</p>
                      <p className="text-sm text-gray-600 mt-1">{lead.meetingDetails.meetingDate}</p>
                      <p className="text-sm text-gray-600">
                        {lead.meetingDetails.startTime} — {lead.meetingDetails.endTime}
                      </p>
                      <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-purple-100 text-purple-700">
                        {lead.meetingDetails.status}
                      </span>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Created By</p>
                    <p className="text-gray-900 font-medium text-lg">{lead.createdByName || "Unknown"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Created At</p>
                    <p className="text-gray-900 font-medium text-lg">{formatDate(lead.createdAt)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Last Updated</p>
                    <p className="text-gray-900 font-medium text-lg">{formatDate(lead.updatedAt)}</p>
                  </div>
                </div>
              </>
            ) : (
              /* ─── EDIT FORM ─── */
              <form onSubmit={handleUpdateLead}>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Edit Lead Details</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updating ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone <span className="text-red-500">*</span>
                      {(user.role === "employee" || user.role === "meeting") && (
                        <span className="text-xs text-gray-500 ml-2">(Read-only)</span>
                      )}
                    </label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setEditForm({ ...editForm, phone: value });
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      required
                      disabled={user.role === "employee" || user.role === "meeting"}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <input
                      type="text"
                      value={editForm.state}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                    <input
                      type="number"
                      value={editForm.age}
                      onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                      min="1"
                      max="120"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Passport Type</label>
                    <select
                      value={editForm.passportType}
                      onChange={(e) => setEditForm({ ...editForm, passportType: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="">Select passport type</option>
                      <option value="ECR">ECR</option>
                      <option value="NECR">NECR</option>
                      <option value="NA">NA</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Lead Source</label>
                    <input
                      type="text"
                      value={editForm.leadSource}
                      onChange={(e) => setEditForm({ ...editForm, leadSource: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      placeholder="Enter lead source"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Job Applied</label>
                    <input
                      type="text"
                      value={editForm.jobApplied}
                      onChange={(e) => setEditForm({ ...editForm, jobApplied: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      placeholder="Enter job applied"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Lead Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="new-lead">🆕 New Lead</option>
                      <option value="call-back">📞 Call Back</option>
                      <option value="not-answering">📵 Not Answering</option>
                      <option value="meeting-scheduled">📋 Meeting Scheduled</option>
                      <option value="not-interested">❌ Not Interested</option>
                      <option value="wrong-number">📱 Wrong Number</option>
                      <option value="document-pending">📄 Document Pending</option>
                      <option value="payment-pending">💰 Payment Pending</option>
                      <option value="sales">🎉 Sales</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">System Information:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Status: {lead.status}</li>
                        <li>Assigned To: {lead.assignedToName || "Unassigned"}</li>
                        <li>Created By: {lead.createdByName || "Unknown"}</li>
                        <li>Created At: {formatDate(lead.createdAt)}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* ─── UPDATE STATUS + NOTES SECTION ─── */}
          {!isEditing &&
            (user.role === "admin" ||
              ((user.role === "employee" || user.role === "meeting") &&
                lead.assignedTo === user.id)) && (
              <div className="bg-white shadow-lg rounded-xl p-8 mb-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h2 className="text-2xl font-bold text-gray-900">Update Lead</h2>
                </div>

                <div className="mb-6">
                  <span
                    className={`inline-flex px-4 py-2 rounded-full text-sm font-semibold ${
                      selectedStatus === "new-lead" ? "bg-blue-100 text-blue-700"
                      : selectedStatus === "call-back" ? "bg-yellow-100 text-yellow-700"
                      : selectedStatus === "not-answering" ? "bg-orange-100 text-orange-700"
                      : selectedStatus === "meeting-scheduled" ? "bg-purple-100 text-purple-700"
                      : selectedStatus === "not-interested" ? "bg-red-100 text-red-700"
                      : selectedStatus === "wrong-number" ? "bg-pink-100 text-pink-700"
                      : selectedStatus === "document-pending" ? "bg-indigo-100 text-indigo-700"
                      : selectedStatus === "payment-pending" ? "bg-amber-100 text-amber-700"
                      : selectedStatus === "sales" ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {selectedStatus === "new-lead" && "🆕 New Lead"}
                    {selectedStatus === "call-back" && "📞 Call Back"}
                    {selectedStatus === "not-answering" && "📵 Not Answering"}
                    {selectedStatus === "meeting-scheduled" && "📋 Meeting Scheduled"}
                    {selectedStatus === "not-interested" && "❌ Not Interested"}
                    {selectedStatus === "wrong-number" && "📱 Wrong Number"}
                    {selectedStatus === "document-pending" && "📄 Document Pending"}
                    {selectedStatus === "payment-pending" && "💰 Payment Pending"}
                    {selectedStatus === "sales" && "🎉 Sales"}
                  </span>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Lead Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="new-lead">🆕 New Lead</option>
                    <option value="call-back">📞 Call Back</option>
                    <option value="not-answering">📵 Not Answering</option>
                    <option value="meeting-scheduled">📋 Meeting Scheduled</option>
                    <option value="not-interested">❌ Not Interested</option>
                    <option value="wrong-number">📱 Wrong Number</option>
                    <option value="document-pending">📄 Document Pending</option>
                    <option value="payment-pending">💰 Payment Pending</option>
                    <option value="sales">🎉 Sales</option>
                  </select>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Add Note</label>
                  <textarea
                  value={note}
                  required
                  
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    placeholder="Enter note here..."
                    style={{ color: "#111827", backgroundColor: "#ffffff" }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={
                      updatingStatus ||
                      addingNote ||
                      !note.trim()
                    }
                    onClick={async () => {
                      if (selectedStatus !== lead.status) {
                        await handleStatusUpdate(selectedStatus);

                        if (
                          user?.role !== "admin" &&
                          ["wrong-number", "not-interested", "sales"].includes(selectedStatus)
                        ) {
                          return;
                        }
                      }

                      if (note.trim()) {
                        await addNoteOnly();
                      }

                      await fetchLead();
                    }}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {updatingStatus || addingNote ? "Processing..." : "Submit"}
                </button>
              </div>
            )}

          {/* ─── HISTORY SECTION ─── */}
          <div className="bg-white shadow-lg rounded-xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">History</h2>
            </div>
            {lead.history && lead.history.length > 0 ? (
              <div className="space-y-3">
                {lead.history
                  .slice()
                  .reverse()
                  .map((entry, idx) => (
                    <div
                      key={idx}
                      className="relative pl-8 pb-6 border-l-2 border-gray-200 last:border-l-0 last:pb-0"
                    >
                      <div className="absolute left-0 top-1 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow"></div>
                      <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="text-gray-900 font-semibold text-lg mb-1">
                              {formatHistoryAction(entry)}
                            </p>
                            <p className="text-sm text-gray-600">
                              by <span className="font-medium">{entry.performedByName}</span>
                            </p>
                          </div>
                          <p className="text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No history available</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
