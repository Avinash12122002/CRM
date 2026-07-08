import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLeadPipeline(
  matchFilter: Record<string, any>,
  payloadId: any,
  opts?: { skip?: number; limit?: number }
) {
  const pipeline: any[] = [
    { $match: matchFilter },

    {
      $lookup: {
        from: "users",
        localField: "assignedTo",
        foreignField: "id",
        as: "assignedUser",
      },
    },
    { $unwind: { path: "$assignedUser", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "id",
        as: "creator",
      },
    },
    { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        id: 1,
        name: 1,
        email: 1,
        phone: 1,
        company: 1,
        status: 1,
        callbackDate: 1,
        callbackSeen: 1,
        dueDate: 1,

        assignedTo: 1,
        assignedToName: { $ifNull: ["$assignedUser.name", "$assignedToName"] },
        assignedToEmail: "$assignedUser.email",
        assignedToUsername: "$assignedUser.username",
        assignedToRole: { $ifNull: ["$assignedUser.role", "$assignedToRole"] },

        assignedBy: 1,
        assignedByName: 1,
        assignedByRole: 1,

        participants: 1,
        visibleTo: 1,

        createdBy: 1,
        createdByName: "$creator.name",

        createdAt: 1,
        updatedAt: 1,

        history: 1,

        meetingDetails: 1,
        meetingStatus: 1,
        meetingCompletedAt: 1,
        meetingCancelledAt: 1,
      },
    },

    {
      $addFields: {
        isOwner: { $eq: ["$assignedTo", payloadId] },
        lastNote: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$history",
                as: "item",
                cond: { $eq: ["$$item.action", "note_added"] },
              },
            },
            -1,
          ],
        },
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "lastNote.performedBy",
        foreignField: "id",
        as: "lastNoteUser",
      },
    },
    { $unwind: { path: "$lastNoteUser", preserveNullAndEmptyArrays: true } },

    {
      $addFields: {
        lastNoteAddedByAdmin: { $eq: ["$lastNoteUser.role", "admin"] },
        assignedByAdmin: { $eq: ["$assignedByRole", "admin"] },
      },
    },

    // IMPORTANT: SORT BEFORE PAGINATION (unchanged priority sorting)
    {
      $sort: {
        lastNoteAddedByAdmin: -1,
        assignedByAdmin: -1,
        createdAt: -1,
      },
    },
  ];

  if (opts && typeof opts.skip === "number") {
    pipeline.push({ $skip: opts.skip });
  }
  if (opts && typeof opts.limit === "number") {
    pipeline.push({ $limit: opts.limit });
  }

  pipeline.push({
    $project: {
      id: 1,
      name: 1,
      email: 1,
      phone: 1,
      company: 1,
      status: 1,
      callbackDate: 1,
      callbackSeen: 1,
      dueDate: 1,

      assignedTo: 1,
      assignedToName: 1,
      assignedToEmail: 1,
      assignedToUsername: 1,
      assignedToRole: 1,

      assignedBy: 1,
      assignedByName: 1,
      assignedByRole: 1,

      participants: 1,

      createdBy: 1,
      createdByName: 1,

      createdAt: 1,
      updatedAt: 1,

      meetingDetails: 1,
      meetingDate: "$meetingDetails.meetingDate",
      startTime: "$meetingDetails.startTime",
      endTime: "$meetingDetails.endTime",
      meetingUserName: "$meetingDetails.meetingUserName",
      bookedBy: "$meetingDetails.bookedBy",
      bookedByName: "$meetingDetails.bookedByName",

      meetingStatus: 1,
      meetingCompletedAt: 1,
      meetingCancelledAt: 1,

      lastNoteAddedByAdmin: 1,
      assignedByAdmin: 1,
      visibleTo: 1,
      isOwner: 1,

      lastNote: {
        $cond: {
          if: { $gt: ["$lastNote", null] },
          then: {
            note: "$lastNote.details",
            timestamp: "$lastNote.timestamp",
            performedByName: "$lastNoteUser.name",
          },
          else: null,
        },
      },
    },
  });

  return pipeline;
}



export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get filter parameters
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const assignedTo = searchParams.get("assignedTo") || "";
    const month = searchParams.get("month") || "";
    const year = searchParams.get("year") || "";
    const meetingUserId = searchParams.get("meetingUserId") || "";
    const meetingStatus = searchParams.get("meetingStatus") || "";
    const meetingDate = searchParams.get("meetingDate") || "";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filter: Record<string, any> = {};
    if (payload.role === "employee" || payload.role === "meeting") {
      filter = {
        $or: [{ assignedTo: payload.id }, { visibleTo: payload.id }],
        status: {
          $nin: ["wrong-number", "not-interested", "sales"],
        },
      };
    }
    // Admins can see all leads

    // Apply search filter (name or phone)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Apply status filter
    if (status) {
      filter.status = status;
    } else if (payload.role === "employee" || payload.role === "meeting") {
      filter.status = {
        $nin: ["wrong-number", "not-interested", "sales"],
      };
    }

    // Apply assignedTo filter (admin only)
    if (assignedTo && payload.role === "admin") {
      filter.assignedTo = parseInt(assignedTo);
    }

    if (meetingUserId) {
      filter["meetingDetails.meetingUserId"] = parseInt(meetingUserId);
    }

    if (meetingStatus) {
      filter.meetingStatus = meetingStatus;
    }

    if (meetingDate) {
      filter["meetingDetails.meetingDate"] = meetingDate;
    }

    // Apply month and year filters
    if (month || year) {
      const dateFilter: { $gte?: Date; $lte?: Date } = {};

      if (year && month) {
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        dateFilter.$gte = startDate;
        dateFilter.$lte = endDate;
      } else if (year) {
        const startDate = new Date(parseInt(year), 0, 1);
        const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
        dateFilter.$gte = startDate;
        dateFilter.$lte = endDate;
      }

      if (Object.keys(dateFilter).length > 0) {
        filter.createdAt = dateFilter;
      }
    }

    // Total count over the full matching set (unchanged — this is DB truth, not affected by reordering)
    const total = await db.collection("leads").countDocuments(filter);

    // ---- CALLBACK PRIORITY LOGIC ----

    // Today's date in Asia/Kolkata, e.g. "2026-07-15"
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    // If the user explicitly filtered by a status other than "call-back",
    // callback leads wouldn't match that filter anyway — skip priority logic entirely
    // so we never override an explicit status filter.
    const callbackPriorityApplies = !status || status === "call-back";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let todaysCallbackLeads: any[] = [];

    if (callbackPriorityApplies) {
      const callbackMatch = {
        ...filter,
        status: "call-back",
        callbackDate: { $ne: null },
      };

      const rawCallbackLeads = await db
        .collection("leads")
        .aggregate(buildLeadPipeline(callbackMatch, payload.id))
        .toArray();

      todaysCallbackLeads = rawCallbackLeads
        .filter((lead) => {
          if (!lead.callbackDate) return false;
          const callbackDay = new Date(lead.callbackDate).toLocaleDateString(
            "en-CA",
            { timeZone: "Asia/Kolkata" }
          );
          return callbackDay === todayStr;
        })
        .map((lead) => ({ ...lead, isDueToday: true }));
    }

    const callbackIds = todaysCallbackLeads
      .map((lead) => lead.id)
      .filter((id) => id !== undefined && id !== null);

    const callbackCount = todaysCallbackLeads.length;
    

    // Exclude today's callback leads from the normal paginated set so they never
    // appear twice (they only ever show pinned to the top of page 1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalFilter: Record<string, any> =
      callbackIds.length > 0
        ? { $and: [filter, { id: { $nin: callbackIds } }] }
        : filter;

    // Shift pagination so removing callback leads from the normal list doesn't
    // create gaps or repeats on later pages.
    let normalSkip: number;
    let normalLimit: number;

    if (page === 1) {
      normalSkip = 0;
      normalLimit = Math.max(limit - callbackCount, 0);
    } else {
      normalSkip = Math.max((page - 1) * limit - callbackCount, 0);
      normalLimit = limit;
    }
    

    const normalLeadsRaw =
      normalLimit > 0
        ? await db
            .collection("leads")
            .aggregate(
              buildLeadPipeline(normalFilter, payload.id, {
                skip: normalSkip,
                limit: normalLimit,
              })
            )
            .toArray()
        : [];

    const normalLeads = normalLeadsRaw.map((lead) => ({
      ...lead,
      isDueToday: false,
    }));

    const combinedLeads =
      page === 1 ? [...todaysCallbackLeads, ...normalLeads] : normalLeads;

    return NextResponse.json({
      leads: combinedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}