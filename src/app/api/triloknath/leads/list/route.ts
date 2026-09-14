import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

function buildTriloknathPipeline(
  matchFilter: Record<string, unknown>,
  payloadId: number | string,
  payloadRole?: string,
  opts?: { skip?: number; limit?: number }
) {
  const pipeline: Record<string, unknown>[] = [
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
        followUpWorkflow: 1,
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

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    if (
      payload.role !== "admin" &&
      payload.role !== "telecaller" &&
      payload.role !== "employee" &&
      payload.role !== "meeting" &&
      payload.role !== "wtc" &&
      payload.role !== "wm" &&
      payload.role !== "supervisor" &&
      payload.role !== "follow_up" &&
      payload.role !== "trainee"
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

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
    const collection = db.collection("triloknath_leads");

    const filter: Record<string, unknown> = {};
    const andConditions: Record<string, unknown>[] = [];

    const uid = payload.id;
    const uidStr = String(uid);
    const uidNum = isNaN(Number(uid)) ? null : Number(uid);
    const matchUserIds = Array.from(new Set([uid, uidStr, uidNum].filter((x) => x != null)));

    if (payload.role === "trainee") {
      andConditions.push({
        $or: [
          { assignedTo: { $in: matchUserIds } },
          { visibleTo: { $in: matchUserIds } },
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

    if (search) {
      andConditions.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      });
    }

    if (andConditions.length) {
      filter.$and = andConditions;
    }

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
        $nin: ["wrong-number", "incorrect-number", "not-interested", "sales"],
      };
    } else if (payload.role === "follow_up") {
      // Follow-up users can still view all their leads (including sales / completed follow-ups in read-only format)
      filter.status = { $nin: ["wrong-number", "incorrect-number", "not-interested"] };
    } else if (payload.role === "trainee") {
      filter.status = {
        $nin: ["wrong-number", "incorrect-number", "not-interested"],
      };
    }

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

    if (isAgent === "true") {
      filter.isAgent = true;
    } else if (isAgent === "false") {
      filter.isAgent = { $ne: true };
    }

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

    const total = await collection.countDocuments(filter);

    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const callbackPriorityApplies = !status || status === "call-back";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let todaysCallbackLeads: any[] = [];

    if (callbackPriorityApplies) {
      const callbackMatch = {
        ...filter,
        status: "call-back",
        callbackDate: { $ne: null },
      };

      const rawCallbackLeads = await collection
        .aggregate(buildTriloknathPipeline(callbackMatch, payload.id, payload.role))
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
        "followUpWorkflow.currentStage": { $ne: "completed" },
        $or: [
          { "followUpWorkflow.nextFollowupAt": { $lte: now } },
          { "followUpWorkflow.nextFollowupAt": { $lte: now.toISOString() } },
          { followUpWorkflow: null },
          { "followUpWorkflow.currentStage": "info", "followUpWorkflow.stages.info": { $exists: false } },
        ],
      };

      const rawDueLeads = await collection
        .aggregate(buildTriloknathPipeline(dueMatch, payload.id, payload.role))
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalFilter: Record<string, any> =
      priorityIds.length > 0
        ? { $and: [filter, { id: { $nin: priorityIds } }] }
        : filter;

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
        ? await collection
            .aggregate(
              buildTriloknathPipeline(normalFilter, payload.id, payload.role, {
                skip: normalSkip,
                limit: normalLimit,
              })
            )
            .toArray()
        : [];

    const checkFollowUpDue = (lead: Record<string, any>) => {
      if (lead.status !== "follow-up") return false;
      if (
        lead.followUpWorkflow?.status === "not_interested" ||
        lead.followUpWorkflow?.status === "completed" ||
        lead.followUpWorkflow?.currentStage === "completed"
      ) {
        return false;
      }
      if (!lead.followUpWorkflow) return true;
      if (
        lead.followUpWorkflow.currentStage === "info" &&
        !lead.followUpWorkflow.stages?.info
      ) {
        return true;
      }
      if (lead.followUpWorkflow.nextFollowupAt) {
        const nextAt = new Date(lead.followUpWorkflow.nextFollowupAt);
        return !isNaN(nextAt.getTime()) && nextAt.getTime() <= Date.now();
      }
      return false;
    };

    const normalLeads = normalLeadsRaw.map((lead) => {
      const isFuDue = checkFollowUpDue(lead);
      return {
        ...lead,
        isDueToday: false,
        isFollowUpDue: isFuDue,
        followUpDueStage: isFuDue
          ? lead.followUpWorkflow?.currentStage || "info"
          : undefined,
      };
    });

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
