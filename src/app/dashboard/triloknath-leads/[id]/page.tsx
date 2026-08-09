"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import DashboardNavbar from "@/components/DashboardNavbar";

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "telecaller" | "employee" | "meeting";
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
  country?: string;
  age?: number;
  passportType?: string;
  leadSource?: string;
  jobApplied?: string;
  status: string;
  isAgent?: boolean;
  dueDate?: string;
  callbackDate?: string;
  callbackSeen?: boolean;
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
    bookedBy?: number;
    bookedByName?: string;
    meetingDate?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  };
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  occupations?: string[];
  salesDocument?: {
    fileId: string;
    fileName: string;
    uploadedAt: string;
    uploadedByName?: string;
  };
  history: HistoryEntry[];
  isOwner: boolean;
}

export default function TriloknathLeadDetailPage() {
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
  const [togglingAgent, setTogglingAgent] = useState(false);

  // ── Sales conversion (Case Manager select + PDF upload) modal state ──
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesOccupations, setSalesOccupations] = useState<string[]>([""]);
  const [convertingToSales, setConvertingToSales] = useState(false);
  const [caseManagerOptions, setCaseManagerOptions] = useState<
    { id: number; name: string; leadCount: number }[]
  >([]);
  const [selectedCaseManagerId, setSelectedCaseManagerId] = useState("");
  const [loadingCaseManagers, setLoadingCaseManagers] = useState(false);

  const handleAddOccupationInput = () => {
    setSalesOccupations((prev) => [...prev, ""]);
  };

  const handleOccupationChange = (index: number, val: string) => {
    setSalesOccupations((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleRemoveOccupationInput = (index: number) => {
    setSalesOccupations((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const [adminUsers, setAdminUsers] = useState<{ id: number; name: string }[]>(
    [],
  );

  const [meetingUsers, setMeetingUsers] = useState<User[]>([]);
  const [telecallerUsers, setTelecallerUsers] = useState<User[]>([]);

  // ── Assign / book-new-meeting state ──
  const [selectedTelecaller, setSelectedTelecaller] = useState("");
  const [selectedAdminUser, setSelectedAdminUser] = useState("");
  const [selectedMeetingDate, setSelectedMeetingDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<
    { startTime: string; available: boolean }[]
  >([]);

  // ── Reschedule-specific state (completely separate) ──
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<
    { startTime: string; available: boolean }[]
  >([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    dueDate: "",
    state: "",
    city: "",
    country: "",
    age: "",
    passportType: "",
    leadSource: "",
    jobApplied: "",
    status: "",
    callbackDate: "",
  });

  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const toastShownRef = useRef(false);

  // ─── Derived helpers (stable, no conditional hook calls) ───────────────────
  const activeUserSelector =
    user?.role === "admin" ? selectedAdminUser : selectedTelecaller;

  const setActiveUserSelector = (val: string) => {
    if (user?.role === "admin") {
      setSelectedAdminUser(val);
    } else {
      setSelectedTelecaller(val);
    }
  };

  const isSelectedMeetingUser = meetingUsers.some(
    (m) => String(m.id) === String(activeUserSelector),
  );

  const showAssignSection =
    user &&
    lead &&
    (user.role === "telecaller" || user.role === "employee" || user.role === "meeting") &&
    lead.isOwner;

  const canSeeMeeting =
    lead?.meetingDetails &&
    user &&
    (user.role === "admin" || lead.isOwner || lead.createdBy === user.id);

  const canManageMeeting =
    user?.role === "meeting" &&
    lead?.isOwner &&
    lead?.meetingDetails?.meetingUserId === user?.id;

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      fetchLead();
      fetchAdminUsers();
      fetchMeetingUsers();
      fetchTelecallerUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Slots: assign/book via telecaller selector ──────────────────────────────
  useEffect(() => {
    setSelectedSlot("");
    setAvailableSlots([]);
    const isMeeting = meetingUsers.some(
      (m) => String(m.id) === String(selectedTelecaller),
    );
    if (isMeeting && selectedTelecaller && selectedMeetingDate) {
      fetchAvailableSlots(
        selectedTelecaller,
        selectedMeetingDate,
        setAvailableSlots,
      );
    }
  }, [selectedTelecaller, selectedMeetingDate, meetingUsers]);

  // ── Slots: assign/book via admin selector ─────────────────────────────────
  useEffect(() => {
    setSelectedSlot("");
    setAvailableSlots([]);
    const isMeeting = meetingUsers.some(
      (m) => String(m.id) === String(selectedAdminUser),
    );
    if (isMeeting && selectedAdminUser && selectedMeetingDate) {
      fetchAvailableSlots(
        selectedAdminUser,
        selectedMeetingDate,
        setAvailableSlots,
      );
    }
  }, [selectedAdminUser, selectedMeetingDate, meetingUsers]);

  // ── Slots: reschedule (fully separate state) ──────────────────────────────
  useEffect(() => {
    setRescheduleSlot("");
    setRescheduleSlots([]);
    if (
      showReschedule &&
      lead?.meetingDetails?.meetingUserId &&
      rescheduleDate
    ) {
      fetchAvailableSlots(
        String(lead.meetingDetails.meetingUserId),
        rescheduleDate,
        setRescheduleSlots,
      );
    }
  }, [showReschedule, rescheduleDate, lead]);

  // ── API helpers ────────────────────────────────────────────────────────────
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
      setUser(await res.json());
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
      const res = await fetch("/api/users/by-role?role=meeting");
      const data = await res.json();
      if (res.ok) setMeetingUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTelecallerUsers = async () => {
    try {
      const res = await fetch("/api/users/by-role?role=telecaller");
      const data = await res.json();
      if (res.ok) setTelecallerUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        const targetLead = data.lead || data;
        setLead(targetLead);
        setSelectedStatus(targetLead.status || "");
        const dueDateValue = targetLead.dueDate
          ? new Date(targetLead.dueDate).toISOString().split("T")[0]
          : "";
        setEditForm({
          name: targetLead.name || "",
          phone: targetLead.phone || "",
          email: targetLead.email || "",
          dueDate: dueDateValue,
          callbackDate: targetLead.callbackDate
            ? new Date(targetLead.callbackDate).toISOString().split("T")[0]
            : "",
          state: targetLead.state || "",
          city: targetLead.city || "",
          country: targetLead.country || "",
          age: targetLead.age ? String(targetLead.age) : "",
          passportType: targetLead.passportType || "",
          leadSource: targetLead.leadSource || "",
          jobApplied: targetLead.jobApplied || "",
          status: targetLead.status || "",
        });
      } else if (res.status === 403) {
        router.push("/dashboard/triloknath-leads");
      } else if (res.status === 404) {
        toast.error("Lead not found");
        router.push("/dashboard/triloknath-leads");
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

  const fetchAvailableSlots = async (
    meetingUserId: string,
    meetingDate: string,
    setter: React.Dispatch<
      React.SetStateAction<{ startTime: string; available: boolean }[]>
    >,
  ) => {
    if (!meetingUserId || !meetingDate) {
      setter([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/meetings/available-slots?meetingUserId=${meetingUserId}&meetingDate=${meetingDate}`,
      );
      const data = await res.json();
      setter(res.ok ? data.slots || [] : []);
    } catch (err) {
      console.error(err);
      setter([]);
    }
  };

  const addNoteOnly = async (): Promise<boolean> => {
    if (!note.trim()) {
      toast.error("Note cannot be empty");
      return false;
    }
    setAddingNote(true);
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (res.ok) {
        toast.success("Note added successfully");
        setNote("");
        return true;
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to add note");
        return false;
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      return false;
    } finally {
      setAddingNote(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string): Promise<boolean> => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          callbackDate: editForm.callbackDate,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Status updated successfully");
        if (
          user?.role !== "admin" &&
          ["wrong-number", "not-interested", "sales"].includes(newStatus)
        ) {
          toast.success("Lead returned to Admin");
          window.location.href = "/dashboard/triloknath-leads";
          return true;
        }
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setUpdatingStatus(false);
    }
    return false;
  };

  const fetchCaseManagerOptions = async () => {
    setLoadingCaseManagers(true);
    try {
      const res = await fetch(`/api/case-manager/options`);
      const data = await res.json();
      if (res.ok) {
        setCaseManagerOptions(data.caseManagers || []);
        if (data.caseManagers?.length === 1) {
          setSelectedCaseManagerId(String(data.caseManagers[0].id));
        }
      } else {
        toast.error(data.message || "Failed to load Case Managers");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong loading Case Managers");
    } finally {
      setLoadingCaseManagers(false);
    }
  };

  const handleConvertToSales = async () => {
    if (!selectedCaseManagerId) {
      toast.error("Please select a Case Manager");
      return;
    }

    const validOccupations = salesOccupations
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    if (validOccupations.length === 0) {
      toast.error("Please enter at least one occupation");
      return;
    }

    if (!salesFile) {
      toast.error("Please choose a PDF file to upload");
      return;
    }
    if (salesFile.type !== "application/pdf" && !salesFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are accepted");
      return;
    }

    const MAX_FILE_SIZE = 4.5 * 1024 * 1024;
    if (salesFile.size > MAX_FILE_SIZE) {
      toast.error(
        `File size (${(salesFile.size / (1024 * 1024)).toFixed(1)}MB) exceeds Vercel limit of 4.5MB. Please choose a compressed PDF.`,
      );
      return;
    }

    setConvertingToSales(true);
    try {
      if (note.trim()) {
        const noteAdded = await addNoteOnly();
        if (!noteAdded) {
          setConvertingToSales(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append("file", salesFile);
      formData.append("caseManagerId", selectedCaseManagerId);
      formData.append("occupations", JSON.stringify(validOccupations));

      const res = await fetch(`/api/triloknath/leads/${leadId}/convert-to-sales`, {
        method: "POST",
        body: formData,
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { message: `Server error (${res.status})` };
      }

      if (res.ok) {
        toast.success(
          data.caseManager
            ? `Lead marked as Sales and assigned to ${data.caseManager.name}`
            : "Lead marked as Sales",
        );
        setShowSalesModal(false);
        setSalesFile(null);
        window.location.href = "/dashboard/triloknath-leads";
      } else {
        toast.error(data.message || "Failed to convert lead to Sales");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setConvertingToSales(false);
    }
  };

  const handleEditClick = () => setIsEditing(true);

  const handleEditStatusChange = async (value: string) => {
    setEditForm((prev) => ({ ...prev, status: value }));

    if (value === "sales") {
      setIsEditing(false);
      setShowSalesModal(true);
      fetchCaseManagerOptions();
    }
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
        email: lead.email || "",
        dueDate: dueDateValue,
        callbackDate: lead.callbackDate
          ? new Date(lead.callbackDate).toISOString().split("T")[0]
          : "",
        state: lead.state || "",
        city: lead.city || "",
        country: lead.country || "",
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
    if (!lead) return;
    if (!editForm.phone.trim()) {
      toast.error("Phone is required");
      return;
    }
    if (
      editForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())
    ) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (editForm.status === "call-back" && !editForm.callbackDate) {
      toast.error("Please select callback date");
      return;
    }

    if (editForm.status === "sales" && lead.status !== "sales") {
      setUpdating(true);
      try {
        const res = await fetch(`/api/triloknath/leads/${leadId}/update`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editForm, status: lead.status }),
        });
        if (res.ok) {
          setIsEditing(false);
          await fetchLead();
          setShowSalesModal(true);
          fetchCaseManagerOptions();
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
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/update`, {
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
    if (
      !window.confirm(
        "Are you sure you want to delete this lead? This action cannot be undone.",
      )
    )
      return;
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/delete`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Lead deleted successfully");
        router.push("/dashboard/triloknath-leads");
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
    if (adminUsers.length === 0) {
      toast.error("No admin users available");
      return;
    }
    if (!window.confirm("Are you sure you want to move this lead to admin?"))
      return;
    setMovingToAdmin(true);
    try {
      const adminId = adminUsers[0].id;
      const res = await fetch("/api/triloknath/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: parseInt(leadId), assignedTo: adminId }),
      });
      if (res.ok) {
        toast.success("Lead moved to admin successfully");
        router.push("/dashboard/triloknath-leads");
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

  const handleToggleAgent = async () => {
    if (!lead) return;
    const nextValue = !lead.isAgent;
    if (
      !window.confirm(
        nextValue
          ? "Mark this lead as an Agent? This will flag them across the leads list."
          : "Unmark this lead as an Agent?",
      )
    )
      return;
    setTogglingAgent(true);
    try {
      const res = await fetch(`/api/triloknath/leads/${leadId}/agent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAgent: nextValue }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          nextValue ? "Lead marked as an Agent" : "Lead unmarked as an Agent",
        );
        setLead((prev) => (prev ? { ...prev, isAgent: nextValue } : prev));
        await fetchLead();
      } else {
        toast.error(data.message || "Failed to update agent status");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setTogglingAgent(false);
    }
  };

  const handleAssignUser = async () => {
    if (!lead) {
      toast.error("Lead not found");
      return;
    }
    const targetUser = activeUserSelector;
    if (!targetUser) return;

    const isMeetingUser = meetingUsers.some(
      (m) => String(m.id) === String(targetUser),
    );
    if (isMeetingUser) {
      if (!selectedMeetingDate) {
        toast.error("Please select meeting date");
        return;
      }
      if (!selectedSlot) {
        toast.error("Please select time slot");
        return;
      }
      const res = await fetch("/api/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          meetingUserId: Number(targetUser),
          meetingDate: selectedMeetingDate,
          startTime: selectedSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting booked successfully");
    } else {
      const res = await fetch("/api/triloknath/leads/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          assignedTo: Number(targetUser),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Lead assigned successfully");
    }

    setSelectedTelecaller("");
    setSelectedAdminUser("");
    setSelectedMeetingDate("");
    setSelectedSlot("");
    setAvailableSlots([]);
  };

  const handleCompleteMeeting = async () => {
    if (!lead) return;
    if (
      !window.confirm(
        "Are you sure you want to mark this meeting as completed?",
      )
    )
      return;
    try {
      const res = await fetch("/api/meetings/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting completed");
      router.push("/dashboard/triloknath-leads");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to complete meeting",
      );
    }
  };

  const handleRescheduleMeeting = async () => {
    if (!lead) return;
    const meetingUserId = String(lead.meetingDetails?.meetingUserId || "");
    if (!meetingUserId) {
      toast.error("No meeting user found");
      return;
    }
    if (!rescheduleDate) {
      toast.error("Select meeting date");
      return;
    }
    if (!rescheduleSlot) {
      toast.error("Select meeting slot");
      return;
    }
    try {
      const res = await fetch("/api/meetings/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          meetingUserId: Number(meetingUserId),
          meetingDate: rescheduleDate,
          startTime: rescheduleSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting rescheduled");
      setShowReschedule(false);
      setRescheduleDate("");
      setRescheduleSlot("");
      setRescheduleSlots([]);
      router.push("/dashboard/triloknath-leads");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reschedule meeting",
      );
    }
  };

  const handleCancelMeeting = async () => {
    if (!lead) return;
    if (!window.confirm("Are you sure you want to cancel this meeting?"))
      return;
    try {
      const res = await fetch("/api/meetings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Meeting cancelled");
      router.push("/dashboard/triloknath-leads");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel meeting",
      );
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "new-lead":
        return "bg-blue-100 text-blue-800";
      case "call-back":
        return "bg-yellow-100 text-yellow-800";
      case "not-answering":
        return "bg-orange-100 text-orange-800";
      case "meeting-scheduled":
        return "bg-purple-100 text-purple-800";
      case "not-interested":
        return "bg-red-100 text-red-800";
      case "wrong-number":
        return "bg-pink-100 text-pink-800";
      case "document-pending":
        return "bg-indigo-100 text-indigo-800";
      case "payment-pending":
        return "bg-amber-100 text-amber-800";
      case "sales":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "new-lead":
        return "🆕 New Lead";
      case "call-back":
        return "📞 Call Back";
      case "not-answering":
        return "📵 Not Answering";
      case "meeting-scheduled":
        return "📋 Meeting Scheduled";
      case "not-interested":
        return "❌ Not Interested";
      case "wrong-number":
        return "📱 Wrong Number";
      case "document-pending":
        return "📄 Document Pending";
      case "payment-pending":
        return "💰 Payment Pending";
      case "sales":
        return "🎉 Sales";
      default:
        return status;
    }
  };

  const getStatusSelectColor = (status: string) => {
    switch (status) {
      case "new-lead":
        return "bg-blue-100 text-blue-700";
      case "call-back":
        return "bg-yellow-100 text-yellow-700";
      case "not-answering":
        return "bg-orange-100 text-orange-700";
      case "meeting-scheduled":
        return "bg-purple-100 text-purple-700";
      case "not-interested":
        return "bg-red-100 text-red-700";
      case "wrong-number":
        return "bg-pink-100 text-pink-700";
      case "document-pending":
        return "bg-indigo-100 text-indigo-700";
      case "payment-pending":
        return "bg-amber-100 text-amber-700";
      case "sales":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatHistoryAction = (entry: HistoryEntry) => {
    switch (entry.action) {
      case "created":
        return entry.assignedToName
          ? `Created and assigned to ${entry.assignedToName}`
          : "Created";
      case "assigned":
        return entry.details || "Lead assigned";
      case "unassigned":
        return entry.details || "Lead unassigned";
      case "note_added":
        return `Added note: "${entry.details}"`;
      case "status_updated":
        return entry.details || "Status updated";
      case "lead_updated":
        return entry.details || "Lead details updated";
      case "meeting_booked":
        return entry.details || "Meeting booked";
      case "meeting_rescheduled":
        return entry.details || "Meeting rescheduled";
      case "meeting_cancelled":
        return entry.details || "Meeting cancelled";
      case "meeting_completed":
        return entry.details || "Meeting completed";
      default:
        return entry.action;
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 px-4">
          <p className="text-gray-600 dark:text-gray-400 py-6">
            Loading lead details...
          </p>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  const statusOptions = [
    "new-lead",
    "call-back",
    "not-answering",
    "meeting-scheduled",
    "not-interested",
    "wrong-number",
    "document-pending",
    "payment-pending",
    "sales",
  ] as const;

  const visibleStatusOptions = lead.isAgent
    ? statusOptions.filter((s) => s !== "sales")
    : statusOptions;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardNavbar user={user} />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <button
            onClick={() => router.back()}
            className="mb-6 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2 font-medium transition cursor-pointer"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Triloknath Leads
          </button>

          {/* LEAD DETAILS CARD */}
          <div className="bg-white shadow-lg rounded-xl p-8 mb-6 border border-gray-100">
            {!isEditing ? (
              <>
                <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-4xl font-bold text-gray-900">
                      {lead.name}
                    </h1>
                    {lead.isAgent && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        Agent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`px-4 py-2 text-sm font-bold rounded-full uppercase tracking-wide ${getStatusBadgeColor(lead.status)}`}
                    >
                      {lead.status}
                    </span>

                    {(user.role === "admin" || lead.isOwner) && (
                      <button
                        onClick={handleToggleAgent}
                        disabled={togglingAgent}
                        className={`px-4 py-2 rounded-lg transition font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                          lead.isAgent
                            ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                            : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                        }`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        {togglingAgent
                          ? "Updating..."
                          : lead.isAgent
                            ? "Unmark Agent"
                            : "Mark as Agent"}
                      </button>
                    )}

                    {(user.role === "admin" || lead.isOwner) && (
                      <button
                        onClick={handleEditClick}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Edit
                      </button>
                    )}

                    {(user.role === "admin" || lead.isOwner) && (
                      <button
                        onClick={() => {
                          setShowSalesModal(true);
                          fetchCaseManagerOptions();
                        }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        Send to Case Manager
                      </button>
                    )}

                    {user.role === "admin" && (
                      <button
                        onClick={handleDeleteLead}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Delete
                      </button>
                    )}

                    {user.role !== "admin" && lead.isOwner && (
                      <div className="relative group">
                        <button
                          onClick={handleMoveToAdmin}
                          disabled={
                            movingToAdmin || lead.assignedToRole === "admin"
                          }
                          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                            />
                          </svg>
                          {movingToAdmin ? "Moving..." : "Move To Admin"}
                        </button>
                        {lead.assignedToRole === "admin" && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            Already assigned to admin
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {[
                    { label: "Phone", value: lead.phone },
                    { label: "Email", value: lead.email },
                    { label: "State", value: lead.state },
                    { label: "City", value: lead.city },
                    { label: "Country", value: lead.country },
                    { label: "Age", value: lead.age },
                    { label: "Passport Type", value: lead.passportType },
                    { label: "Lead Source", value: lead.leadSource },
                    { label: "Job Applied", value: lead.jobApplied },
                    {
                      label: "Occupations",
                      value: lead.occupations && lead.occupations.length > 0 ? lead.occupations.join(", ") : null,
                    },
                    {
                      label: "Due Date",
                      value: lead.dueDate
                        ? new Date(lead.dueDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : null,
                    },
                    {
                      label: "Callback Date",
                      value: lead.callbackDate
                        ? new Date(lead.callbackDate).toLocaleDateString()
                        : null,
                    },
                    {
                      label: "Assigned To",
                      value: lead.assignedToName || "Unassigned",
                    },
                    {
                      label: "Created By",
                      value: lead.createdByName || "Unknown",
                    },
                    { label: "Created At", value: formatDate(lead.createdAt) },
                    {
                      label: "Last Updated",
                      value: formatDate(lead.updatedAt),
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
                        {label}
                      </p>
                      <p className="text-gray-900 font-medium text-lg">
                        {value ?? "N/A"}
                      </p>
                    </div>
                  ))}

                  {lead.meetingDetails && (
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold mb-1">
                        Meeting
                      </p>
                      <p className="text-gray-900 font-medium">
                        {lead.meetingDetails.meetingUserName}
                      </p>
                      <p className="text-gray-600 text-sm">
                        {lead.meetingDetails.bookedByName}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {lead.meetingDetails.meetingDate}
                      </p>
                      <p className="text-sm text-gray-600">
                        {lead.meetingDetails.startTime} —{" "}
                        {lead.meetingDetails.endTime}
                      </p>
                      <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-purple-100 text-purple-700 capitalize">
                        {lead.meetingDetails.status}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleUpdateLead}>
                <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Edit Lead Details
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {updating ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone <span className="text-red-500">*</span>
                      {(user.role === "telecaller" || user.role === "employee" ||
                        user.role === "meeting") && (
                        <span className="text-xs text-gray-500 ml-2">
                          (Read-only)
                        </span>
                      )}
                    </label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      required
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          phone: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      disabled={
                        user.role === "telecaller" || user.role === "employee" || user.role === "meeting"
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                      placeholder="candidate@example.com"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      value={editForm.state}
                      onChange={(e) =>
                        setEditForm({ ...editForm, state: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) =>
                        setEditForm({ ...editForm, city: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <input
                      type="text"
                      value={editForm.country}
                      placeholder="Enter country"
                      onChange={(e) =>
                        setEditForm({ ...editForm, country: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      value={editForm.age}
                      min="1"
                      max="120"
                      onChange={(e) =>
                        setEditForm({ ...editForm, age: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Passport Type
                    </label>
                    <select
                      value={editForm.passportType}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          passportType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-pointer"
                    >
                      <option value="">Select passport type</option>
                      <option value="ECR">ECR</option>
                      <option value="NECR">NECR</option>
                      <option value="NA">NA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lead Source
                    </label>
                    <input
                      type="text"
                      value={editForm.leadSource}
                      placeholder="Enter lead source"
                      onChange={(e) =>
                        setEditForm({ ...editForm, leadSource: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Job Applied
                    </label>
                    <input
                      type="text"
                      value={editForm.jobApplied}
                      placeholder="Enter job applied"
                      onChange={(e) =>
                        setEditForm({ ...editForm, jobApplied: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lead Status
                    </label>
                    <select
                      value={editForm.status}
                      onChange={(e) => handleEditStatusChange(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-pointer"
                    >
                      {visibleStatusOptions.map((s) => (
                        <option key={s} value={s}>
                          {getStatusLabel(s)}
                        </option>
                      ))}
                    </select>

                    {editForm.status === "sales" && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false);
                          setShowSalesModal(true);
                          fetchCaseManagerOptions();
                        }}
                        className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 underline flex items-center gap-1 cursor-pointer"
                      >
                        📄 Upload Sales PDF &amp; Assign Case Manager
                      </button>
                    )}
                  </div>
                  {editForm.status === "call-back" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Callback Date
                      </label>

                      <input
                        type="date"
                        value={editForm.callbackDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            callbackDate: e.target.value,
                          })
                        }
                        style={{ colorScheme: "light" }}
                        className="w-full max-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, dueDate: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-blue-600 mt-0.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">System Information:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Status: {lead.status}</li>
                        <li>
                          Assigned To: {lead.assignedToName || "Unassigned"}
                        </li>
                        <li>Created By: {lead.createdByName || "Unknown"}</li>
                        <li>Created At: {formatDate(lead.createdAt)}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* UPDATE LEAD SECTION */}
          {!isEditing && (user.role === "admin" || lead.isOwner) && (
            <div className="bg-white shadow-lg rounded-xl p-8 mb-6 border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h2 className="text-2xl font-bold text-gray-900">
                  Update Lead
                </h2>
              </div>

              <div className="mb-4">
                <span
                  className={`inline-flex px-4 py-2 rounded-full text-sm font-semibold ${getStatusSelectColor(selectedStatus)}`}
                >
                  {getStatusLabel(selectedStatus)}
                </span>
              </div>

              <div className="mb-6 flex flex-col sm:flex-row sm:flex-wrap gap-4">
                <div className="w-full sm:w-auto sm:min-w-[220px]">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Lead Status
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedStatus(value);
                      if (value !== "call-back") {
                        setEditForm((prev) => ({
                          ...prev,
                          callbackDate: "",
                        }));
                      }
                      if (value === "sales") {
                        setShowSalesModal(true);
                        fetchCaseManagerOptions();
                      }
                    }}
                    className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    {visibleStatusOptions.map((s) => (
                      <option key={s} value={s}>
                        {getStatusLabel(s)}
                      </option>
                    ))}
                  </select>

                  {selectedStatus === "sales" && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowSalesModal(true);
                        fetchCaseManagerOptions();
                      }}
                      className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 underline flex items-center gap-1 cursor-pointer"
                    >
                      📄 Click here to upload Sales PDF / assign Case Manager
                    </button>
                  )}
                </div>

                {selectedStatus === "call-back" && (
                  <div className="w-full sm:w-auto">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Callback Date
                    </label>

                    <input
                      type="date"
                      value={editForm.callbackDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          callbackDate: e.target.value,
                        })
                      }
                      style={{ colorScheme: "light" }}
                      className="w-full sm:w-[170px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {(user.role === "admin" || showAssignSection) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {user.role === "admin"
                      ? "Assign Lead (optional)"
                      : "Assign / Transfer (optional)"}
                  </h3>
                  <div className="flex flex-wrap gap-3 items-end">
                    <select
                      value={activeUserSelector}
                      onChange={(e) => {
                        setActiveUserSelector(e.target.value);
                        setSelectedMeetingDate("");
                        setSelectedSlot("");
                        setAvailableSlots([]);
                      }}
                      className="border-2 border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="">Select User</option>
                      {telecallerUsers
                        .filter((e) => e.id !== lead.assignedTo)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            👨‍💼 Telecaller — {emp.name}
                          </option>
                        ))}
                      {meetingUsers.map((m) => (
                        <option key={m.id} value={m.id}>
                          📅 Meeting — {m.name}
                          {m.id === user?.id ? " (Me)" : ""}
                        </option>
                      ))}
                    </select>

                    {isSelectedMeetingUser && activeUserSelector && (
                      <>
                        <input
                          type="date"
                          value={selectedMeetingDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => {
                            setSelectedMeetingDate(e.target.value);
                            setSelectedSlot("");
                          }}
                          className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-500 cursor-pointer"
                        />
                        {selectedMeetingDate && (
                          <select
                            value={selectedSlot}
                            onChange={(e) => setSelectedSlot(e.target.value)}
                            className="border-2 border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="">Select Time Slot</option>
                            {availableSlots
                              .filter((s) => s.available)
                              .map((s) => (
                                <option key={s.startTime} value={s.startTime}>
                                  {s.startTime}
                                </option>
                              ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                  {isSelectedMeetingUser &&
                    activeUserSelector &&
                    (!selectedMeetingDate || !selectedSlot) && (
                      <p className="mt-2 text-xs text-amber-600">
                        Select a meeting date and time slot — they will be
                        booked on Submit.
                      </p>
                    )}
                </div>
              )}

              {canSeeMeeting && (
                <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
                  <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-purple-600 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    Meeting Details
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm text-gray-800 mb-4">
                    {[
                      {
                        label: "Meeting User",
                        value: lead.meetingDetails!.meetingUserName,
                      },
                      {
                        label: "Booked By",
                        value: lead.meetingDetails!.bookedByName,
                      },
                      {
                        label: "Date",
                        value: lead.meetingDetails!.meetingDate,
                      },
                      {
                        label: "Start Time",
                        value: lead.meetingDetails!.startTime,
                      },
                      {
                        label: "End Time",
                        value: lead.meetingDetails!.endTime,
                      },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="bg-white rounded-lg p-3 border border-purple-100"
                      >
                        <p className="text-xs text-purple-500 font-semibold uppercase mb-1">
                          {label}
                        </p>
                        <p className="font-medium">{value || "—"}</p>
                      </div>
                    ))}
                    <div className="bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-xs text-purple-500 font-semibold uppercase mb-1">
                        Status
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          lead.meetingDetails!.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : lead.meetingDetails!.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {lead.meetingDetails!.status || "—"}
                      </span>
                    </div>
                  </div>

                  {canManageMeeting && (
                    <div className="flex gap-2 flex-wrap">
                      {lead.meetingDetails!.status !== "completed" &&
                        lead.meetingDetails!.status !== "cancelled" && (
                          <button
                            onClick={() => {
                              setShowReschedule((prev) => !prev);
                              setRescheduleDate("");
                              setRescheduleSlot("");
                              setRescheduleSlots([]);
                            }}
                            className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 font-medium text-sm cursor-pointer transition"
                          >
                            {showReschedule ? "Close Reschedule" : "Reschedule"}
                          </button>
                        )}
                      {lead.meetingDetails!.status !== "cancelled" &&
                        lead.meetingDetails!.status !== "completed" && (
                          <button
                            onClick={handleCancelMeeting}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 font-medium text-sm cursor-pointer transition"
                          >
                            Cancel Meeting
                          </button>
                        )}
                      {lead.meetingDetails!.status !== "completed" && (
                        <button
                          onClick={handleCompleteMeeting}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm cursor-pointer transition"
                        >
                          Mark Complete
                        </button>
                      )}
                    </div>
                  )}

                  {showReschedule && canManageMeeting && (
                    <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                      <h4 className="text-sm font-semibold text-yellow-800 mb-3">
                        Pick New Date &amp; Slot
                      </h4>
                      <div className="flex flex-wrap gap-3 items-end">
                        <div>
                          <label className="block text-xs text-yellow-700 font-medium mb-1">
                            New Date
                          </label>
                          <input
                            type="date"
                            value={rescheduleDate}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={(e) => {
                              setRescheduleDate(e.target.value);
                              setRescheduleSlot("");
                            }}
                            className="border-2 border-yellow-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-yellow-500 cursor-pointer"
                          />
                        </div>
                        {rescheduleDate && (
                          <div>
                            <label className="block text-xs text-yellow-700 font-medium mb-1">
                              Time Slot
                            </label>
                            <select
                              value={rescheduleSlot}
                              onChange={(e) =>
                                setRescheduleSlot(e.target.value)
                              }
                              className="border-2 border-yellow-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-yellow-500 cursor-pointer"
                            >
                              <option value="">Select Slot</option>
                              {rescheduleSlots
                                .filter((s) => s.available)
                                .map((s) => (
                                  <option key={s.startTime} value={s.startTime}>
                                    {s.startTime}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                        {rescheduleDate && rescheduleSlot && (
                          <button
                            onClick={handleRescheduleMeeting}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm cursor-pointer transition self-end"
                          >
                            Confirm Reschedule
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setShowReschedule(false);
                            setRescheduleDate("");
                            setRescheduleSlot("");
                            setRescheduleSlots([]);
                          }}
                          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium text-sm cursor-pointer transition self-end"
                        >
                          Discard
                        </button>
                      </div>
                      {rescheduleDate && rescheduleSlots.length === 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          No available slots for this date.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Add Note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={5}
                  placeholder="Enter note here... (required)"
                  style={{ color: "#111827", backgroundColor: "#ffffff" }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-text"
                />
              </div>

              <button
                type="button"
                disabled={updatingStatus || addingNote || !note.trim()}
                onClick={async () => {
                  try {
                    if (!note.trim()) {
                      toast.error("Please add a note before submitting.");
                      return;
                    }

                    if (
                      selectedStatus === "sales" &&
                      lead.status !== "sales"
                    ) {
                      setShowSalesModal(true);
                      fetchCaseManagerOptions();
                      return;
                    }

                    if (isSelectedMeetingUser && activeUserSelector) {
                      if (!selectedMeetingDate) {
                        toast.error("Please select a meeting date.");
                        return;
                      }
                      if (!selectedSlot) {
                        toast.error("Please select a meeting time slot.");
                        return;
                      }
                    }

                    if (
                      selectedStatus === "call-back" &&
                      !editForm.callbackDate
                    ) {
                      toast.error("Please select callback date");
                      return;
                    }
                    const noteAdded = await addNoteOnly();
                    if (!noteAdded) return;

                    if (
                      selectedStatus !== lead.status ||
                      selectedStatus === "call-back"
                    ) {
                      const willRedirect =
                        await handleStatusUpdate(selectedStatus);
                      if (willRedirect) return;
                    }
                    if (activeUserSelector) {
                      await handleAssignUser();
                      router.push("/dashboard/triloknath-leads");
                      return;
                    }

                    await fetchLead();
                  } catch (error) {
                    console.error(error);
                    toast.error("Something went wrong");
                  }
                }}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {updatingStatus || addingNote ? "Processing..." : "Submit"}
              </button>
            </div>
          )}

          {/* HISTORY SECTION */}
          <div className="bg-white shadow-lg rounded-xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
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
                      <div className="absolute left-0 top-1 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow" />
                      <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition cursor-default">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="text-gray-900 font-semibold text-lg mb-1">
                              {formatHistoryAction(entry)}
                            </p>
                            <p className="text-sm text-gray-600">
                              by{" "}
                              <span className="font-medium">
                                {entry.performedByName}
                              </span>
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

      {/* SALES CONVERSION — CASE MANAGER + PDF UPLOAD MODAL */}
      {showSalesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              Convert Lead to Sales
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Marking this lead as <span className="font-semibold">Sales</span>{" "}
              requires picking a Case Manager, entering the candidate&apos;s occupation(s), and uploading the signed document (PDF).
            </p>

            {/* Field 1: Case Manager */}
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              1. Case Manager <span className="text-red-500">*</span>
            </label>
            {loadingCaseManagers ? (
              <p className="text-sm text-gray-500 mb-4">Loading Case Managers...</p>
            ) : caseManagerOptions.length === 0 ? (
              <p className="text-sm text-red-600 mb-4">
                No Case Manager is set up yet. Please add a Case Manager user first.
              </p>
            ) : (
              <select
                value={selectedCaseManagerId}
                onChange={(e) => setSelectedCaseManagerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 cursor-pointer"
              >
                <option value="">Select a Case Manager</option>
                {caseManagerOptions.map((cm) => (
                  <option key={cm.id} value={cm.id}>
                    {cm.name} — {cm.leadCount} {cm.leadCount === 1 ? "lead" : "leads"}
                  </option>
                ))}
              </select>
            )}

            {/* Field 2: Occupations (Multiple inputs + Add button) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  2. Occupations <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddOccupationInput}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  + Add Occupation
                </button>
              </div>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {salesOccupations.map((occ, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Occupation ${idx + 1} (e.g. Cook, Welder)`}
                      value={occ}
                      onChange={(e) => handleOccupationChange(idx, e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {salesOccupations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOccupationInput(idx)}
                        className="px-2 py-1 text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer"
                        title="Remove occupation"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Field 3: Signed Document / Resume (PDF) */}
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              3. Signed Document / Resume (PDF) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setSalesFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-700 border border-gray-300 rounded-lg p-2 mb-4 cursor-pointer"
            />

            {/* Field 4: Submit & Cancel Buttons */}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={
                  convertingToSales ||
                  loadingCaseManagers ||
                  caseManagerOptions.length === 0
                }
                onClick={handleConvertToSales}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
              >
                {convertingToSales ? "Uploading..." : "Confirm & Convert to Sales"}
              </button>
              <button
                type="button"
                disabled={convertingToSales}
                onClick={() => {
                  setShowSalesModal(false);
                  setSalesFile(null);
                  setSelectedCaseManagerId("");
                  setSalesOccupations([""]);
                  setCaseManagerOptions([]);
                }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
