import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLeadPipeline(
  matchFilter: Record<string, any>,
  payloadId: any,
  payloadRole?: string,
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
        isAgent: 1,
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
        isOwner: {
          $cond: {
            if: {
              $and: [
                { $eq: [payloadRole, "follow_up"] },
                {
                  $or: [
                    { $eq: ["$followUpWorkflow.status", "completed"] },
                    { $eq: ["$followUpWorkflow.currentStage", "completed"] },
                    { $eq: ["$status", "sales"] },
                  ],
                },
              ],
            },
            then: false,
            else: {
              $or: [
                { $eq: ["$assignedTo", payloadId] },
                { $eq: ["$assignedTo", String(payloadId)] },
                ...(payloadRole === "trainee" ? [{ $eq: ["$status", "sales"] }] : []),
              ],
            },
          },
        },
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
      isAgent: 1,
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
      followUpWorkflow: 1,

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

    // This endpoint powers the general Leads workspace (admin/telecaller/meeting
    // only). Other roles have their own dedicated, properly-scoped lead feeds
    // (case-manager/leads/list, bd/leads/list, billing/summary) — without this
    // check they'd fall through to the unrestricted branch below and see
    // every lead in the system.
    if (
      payload.role !== "admin" &&
      payload.role !== "telecaller" && payload.role !== "employee" &&
      payload.role !== "meeting" &&
      payload.role !== "wtc" && payload.role !== "wm" &&
      payload.role !== "supervisor" &&
      payload.role !== "follow_up" &&
      payload.role !== "trainee"
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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
    const isAgent = searchParams.get("isAgent") || "";

    const { db } = await connectToDatabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filter: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const andConditions: Record<string, any>[] = [];

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    if (payload.role === "trainee") {
      andConditions.push({
        $or: [
          { assignedTo: { $in: matchUserIds } },
          { visibleTo: { $in: matchUserIds } },
          { status: "sales" },
        ],
      });
    } else if (
      payload.role === "telecaller" ||
      payload.role === "employee" ||
      payload.role === "meeting" ||
      payload.role === "wtc" ||
      payload.role === "wm" ||
      payload.role === "supervisor" ||
      payload.role === "follow_up"
    ) {
      andConditions.push({
        $or: [
          { assignedTo: { $in: matchUserIds } },
          { visibleTo: { $in: matchUserIds } },
        ],
      });
    }
    // Admins can see all leads

    // Apply search filter (name, phone, or email) — combined via $and so it
    // narrows results without clobbering the telecaller/meeting visibility
    // restriction above.
    if (search) {
      andConditions.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      });
    }
    // Apply assignedTo filter (admin only)
    if (assignedTo && payload.role === "admin") {
      const uid = parseInt(assignedTo);
      if (!isNaN(uid)) {
        const uidStr = String(uid);
        andConditions.push({
          $or: [
            { assignedTo: uid },
            { assignedTo: uidStr },
            { "meetingDetails.bookedBy": uid },
            { "meetingDetails.bookedBy": uidStr },
            { "meetingDetails.meetingUserId": uid },
            { "meetingDetails.meetingUserId": uidStr },
            { "salesDocument.uploadedBy": uid },
            { "salesDocument.uploadedBy": uidStr },
            { history: { $elemMatch: { action: "status_updated", newStatus: "sales", performedBy: { $in: [uid, uidStr] } } } },
          ],
        });
      }
    }

    if (andConditions.length) {
      filter.$and = andConditions;
    }

    // Apply status filter
    if (status) {
      filter.status = status;
    } else if (
      payload.role === "telecaller" ||
      payload.role === "employee" ||
      payload.role === "meeting" ||
      payload.role === "wtc" ||
      payload.role === "wm" ||
      payload.role === "supervisor"
    ) {
      filter.status = {
        $nin: ["wrong-number", "not-interested", "sales"],
      };
    } else if (payload.role === "follow_up") {
      // Follow-up users can still view all their leads (including sales / completed follow-ups in read-only format)
      filter.status = { $nin: ["wrong-number", "not-interested"] };
    } else if (payload.role === "trainee") {
      filter.status = {
        $nin: ["wrong-number", "not-interested"],
      };
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

    if (isAgent === "true") {
      filter.isAgent = true;
    } else if (isAgent === "false") {
      filter.isAgent = { $ne: true };
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
        .aggregate(buildLeadPipeline(callbackMatch, payload.id, payload.role))
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

    // ---- FOLLOW-UP USER DUE LEADS PRIORITY (Floats to top of leads only for follow-up user) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dueFollowUpLeads: any[] = [];
    if (payload.role === "follow_up" && (!status || status === "follow-up")) {
      const now = new Date();
      const dueMatch = {
        ...filter,
        status: "follow-up",
        "followUpWorkflow.status": { $nin: ["not_interested", "completed"] },
        $or: [
          { "followUpWorkflow.nextFollowupAt": { $lte: now } },
          { "followUpWorkflow.nextFollowupAt": { $lte: now.toISOString() } },
          { followUpWorkflow: null },
          { "followUpWorkflow.currentStage": "info", "followUpWorkflow.stages.info": { $exists: false } },
        ],
      };

      const rawDueLeads = await db
        .collection("leads")
        .aggregate(buildLeadPipeline(dueMatch, payload.id, payload.role))
        .toArray();

      dueFollowUpLeads = rawDueLeads.map((lead) => ({
        ...lead,
        isFollowUpDue: true,
        followUpDueStage: lead.followUpWorkflow?.currentStage || "info",
      }));
    }

    const dueFollowUpIds = dueFollowUpLeads
      .map((lead) => lead.id)
      .filter((id) => id !== undefined && id !== null);

    // Combine priority IDs (callbacks + due follow-ups)
    const priorityIds = Array.from(new Set([...callbackIds, ...dueFollowUpIds]));
    const priorityCount = priorityIds.length;

    // Exclude priority leads from the normal paginated set so they never
    // appear twice (they only ever show pinned to the top of page 1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalFilter: Record<string, any> =
      priorityIds.length > 0
        ? { $and: [filter, { id: { $nin: priorityIds } }] }
        : filter;

    // Shift pagination so removing priority leads from the normal list doesn't
    // create gaps or repeats on later pages.
    let normalSkip: number;
    let normalLimit: number;

    if (page === 1) {
      normalSkip = 0;
      normalLimit = Math.max(limit - priorityCount, 0);
    } else {
      normalSkip = Math.max((page - 1) * limit - priorityCount, 0);
      normalLimit = limit;
    }

    const normalLeadsRaw =
      normalLimit > 0
        ? await db
            .collection("leads")
            .aggregate(
              buildLeadPipeline(normalFilter, payload.id, payload.role, {
                skip: normalSkip,
                limit: normalLimit,
              })
            )
            .toArray()
        : [];

    const normalLeads = normalLeadsRaw.map((lead) => ({
      ...lead,
      isDueToday: false,
      isFollowUpDue: false,
    }));

    // For follow_up user, due follow-up leads appear at the very top, followed by callbacks, then normal
    const combinedLeads =
      page === 1
        ? [...dueFollowUpLeads, ...todaysCallbackLeads, ...normalLeads]
        : normalLeads;

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