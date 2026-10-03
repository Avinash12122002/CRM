import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

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

    const token =
      matches
        ? matches[2]
        : null;

    if (!token) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      await req.json();

    const {
      messageId,
    } = body;

    const { db } =
      await connectToDatabase();

    const exists =
      await db
        .collection(
          "starredMessages",
        )
        .findOne({
          userId:
            payload.id,

          messageId,
        });

    if (!exists) {
      await db
        .collection(
          "starredMessages",
        )
        .insertOne({
          userId:
            payload.id,

          messageId,

          starredAt:
            new Date(),
        });
    }

    return NextResponse.json({
      message:
        "Message starred",
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

export async function DELETE(
  req: NextRequest,
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token =
      matches
        ? matches[2]
        : null;

    if (!token) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      await req.json();

    const {
      messageId,
    } = body;

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "starredMessages",
      )
      .deleteOne({
        userId:
          payload.id,

        messageId,
      });

    return NextResponse.json({
      message:
        "Message unstarred",
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

export async function GET(
  req: NextRequest,
) {
  try {
    const cookie =
      req.headers.get("cookie") || "";

    const matches =
      cookie.match(
        /(^|; )token=([^;]+)/,
      );

    const token =
      matches
        ? matches[2]
        : null;

    if (!token) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const payload =
      verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        {
          message:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const { db } =
      await connectToDatabase();

    const starred =
      await db
        .collection(
          "starredMessages",
        )
        .aggregate([
          {
            $match: {
              userId:
                payload.id,
            },
          },
          {
            $lookup: {
              from:
                "messages",
              localField:
                "messageId",
              foreignField:
                "id",
              as: "message",
            },
          },
          {
            $unwind:
              "$message",
          },
          {
            $sort: {
              starredAt:
                -1,
            },
          },
        ])
        .toArray();

    return NextResponse.json({
      starred,
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