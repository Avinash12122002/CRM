"use client";

import { useEffect, useState } from "react";
import DashboardNavbar from "@/components/DashboardNavbar";

type Meeting = {
  id: number;
  name: string;
  phone: string;
  status: string;
  meetingStatus?: string;

  meetingDetails?: {
    meetingDate: string;
    startTime: string;
    endTime: string;
    meetingUserName: string;
    status: string;
  };
};

type User = {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "employee" | "meeting";
};

export default function MeetingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const getMeetingColors = (status?: string) => {
    switch (status) {
      case "completed":
        return {
          row: "bg-green-50",
          text: "text-green-700",
        };

      case "cancelled":
        return {
          row: "bg-red-50",
          text: "text-red-700",
        };

      default:
        return {
          row: "bg-blue-50",
          text: "text-blue-700",
        };
    }
  };

  const fetchMeetings = async () => {
    try {
      const res = await fetch("/api/meetings");

      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const meRes = await fetch("/api/auth/me");

        if (!meRes.ok) return;

        const me = await meRes.json();

        setUser(me);

        await fetchMeetings();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const completeMeeting = async (leadId: number) => {
    try {
      const res = await fetch("/api/meetings/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Meeting completed");
        fetchMeetings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cancelMeeting = async (leadId: number) => {
    try {
      const res = await fetch("/api/meetings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Meeting cancelled");
        fetchMeetings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {user && <DashboardNavbar user={user} />}

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            Meetings
          </h1>

          <p className="text-zinc-600 mt-2">
            Manage all scheduled meetings
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-100 dark:bg-zinc-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    Lead
                  </th>

                  <th className="px-4 py-3 text-left">
                    Phone
                  </th>

                  <th className="px-4 py-3 text-left">
                    Meeting Date
                  </th>

                  <th className="px-4 py-3 text-left">
                    Start Time
                  </th>

                  <th className="px-4 py-3 text-left">
                    End Time
                  </th>

                  <th className="px-4 py-3 text-left">
                    Meeting User
                  </th>

                  <th className="px-4 py-3 text-left">
                    Status
                  </th>

                  <th className="px-4 py-3 text-left">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {meetings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-10"
                    >
                      No meetings found
                    </td>
                  </tr>
                ) : (
                    meetings.map((meeting) => {
                      const colors = getMeetingColors(meeting.meetingStatus);

                      return (
                        <tr
                          key={meeting.id}
                          className={`border-t ${colors.row}`}
                        >
                          <td className={`px-4 py-3 ${colors.text}`}>
                            {meeting.name}
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            {meeting.phone}
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            {
                              meeting.meetingDetails
                                ?.meetingDate
                            }
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            {
                              meeting.meetingDetails
                                ?.startTime
                            }
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            {
                              meeting.meetingDetails
                                ?.endTime
                            }
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            {
                              meeting.meetingDetails
                                ?.meetingUserName
                            }
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${meeting.meetingStatus === "completed"
                                ? "bg-green-100 text-green-700"
                                : meeting.meetingStatus === "cancelled"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-blue-100 text-blue-700"
                                }`}
                            >
                              {meeting.meetingStatus || "scheduled"}
                            </span>
                          </td>

                          <td className={`px-4 py-3 ${colors.text}`}>
                            <div className="flex gap-2">
                              <button
                                disabled={
                                  meeting.meetingStatus === "completed" ||
                                  meeting.meetingStatus === "cancelled"
                                }
                                onClick={() => completeMeeting(meeting.id)}
                                className={`px-3 py-1 text-white rounded text-sm ${meeting.meetingStatus === "completed" ||
                                  meeting.meetingStatus === "cancelled"
                                  ? "bg-gray-300 opacity-40 cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-700"
                                  }`}
                              >
                                Complete
                              </button>

                              <button
                                disabled={
                                  meeting.meetingStatus === "completed" ||
                                  meeting.meetingStatus === "cancelled"
                                }
                                onClick={() => cancelMeeting(meeting.id)}
                                className={`px-3 py-1 text-white rounded text-sm ${meeting.meetingStatus === "completed" ||
                                  meeting.meetingStatus === "cancelled"
                                  ? "bg-gray-300 opacity-40 cursor-not-allowed"
                                  : "bg-red-600 hover:bg-red-700"
                                  }`}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>

                      )
                    })

                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}