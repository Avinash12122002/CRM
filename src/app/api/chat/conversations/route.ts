import { NextRequest, NextResponse } from "next/server";
import {
  connectToDatabase,
} from "@/lib/mongodb";

import {
  verifyToken,
  getNextId,
} from "@/lib/auth";

export async function GET(
  req: NextRequest
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token = matches
      ? matches[2]
      : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { db } =
      await connectToDatabase();

const conversations = await db
  .collection("conversations")
  .aggregate([
    {
      $match: {
        participants: payload.id,
      },
    },

    {
      $addFields: {
        otherUserId: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$participants",
                as: "participant",
                cond: {
                  $ne: [
                    "$$participant",
                    payload.id,
                  ],
                },
              },
            },
            0,
          ],
        },
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "otherUserId",
        foreignField: "id",
        as: "otherUser",
      },
    },

    {
      $unwind: {
        path: "$otherUser",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "messages",
        let: {
          conversationId: "$id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: [
                      "$conversationId",
                      "$$conversationId",
                    ],
                  },
                  {
                    $eq: [
                      "$isRead",
                      false,
                    ],
                  },
                  {
                    $ne: [
                      "$senderId",
                      payload.id,
                    ],
                  },
                ],
              },
            },
          },
          {
            $count: "count",
          },
        ],
        as: "unreadData",
      },
    },

    {
      $project: {
        id: 1,
        participants: 1,
        lastMessage: 1,
        lastMessageAt: 1,
        updatedAt: 1,

        otherUserId:
          "$otherUser.id",

        otherUserName:
          "$otherUser.name",

        otherUserUsername:
          "$otherUser.username",

        otherUserRole:
          "$otherUser.role",

        unreadCount: {
          $ifNull: [
            {
              $arrayElemAt: [
                "$unreadData.count",
                0,
              ],
            },
            0,
          ],
        },
      },
    },

    {
      $sort: {
        updatedAt: -1,
      },
    },
  ])
  .toArray();

    return NextResponse.json({
      conversations,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message:
          "Server Error",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  req: NextRequest,
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token = matches
      ? matches[2]
      : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body =
      await req.json();

    const { userId } = body;

    const { db } =
      await connectToDatabase();

    const existing =
      await db
        .collection(
          "conversations",
        )
        .findOne({
          participants: {
            $all: [
              payload.id,
              userId,
            ],
          },
        });

    if (existing) {
      return NextResponse.json({
        conversation:
          existing,
      });
    }

    const id =
      await getNextId(
        db,
        "conversations",
      );

    const conversation = {
      id,

      participants: [
        payload.id,
        userId,
      ],

      createdAt:
        new Date(),

      updatedAt:
        new Date(),

      lastMessage: "",

      lastMessageAt:
        null,
    };

    await db
      .collection(
        "conversations",
      )
      .insertOne(
        conversation,
      );

    return NextResponse.json({
      conversation,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message:
          "Server Error",
      },
      {
        status: 500,
      },
    );
  }
}