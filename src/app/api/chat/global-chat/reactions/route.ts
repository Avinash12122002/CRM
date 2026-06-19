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
      emoji,
    } = body;

    const { db } =
      await connectToDatabase();

    const message =
      await db
        .collection(
          "globalMessages",
        )
        .findOne({
          id:
            messageId,
        });

    if (!message) {
      return NextResponse.json(
        {
          message:
            "Message not found",
        },
        {
          status: 404,
        },
      );
    }

    const reactions =
      message.reactions ||
      [];

    const filtered =
      reactions.filter(
        (r: any) =>
          r.userId !==
          payload.id,
      );

    filtered.push({
      userId:
        payload.id,

      userName:
        payload.name,

      emoji,
    });

    await db
      .collection(
        "globalMessages",
      )
      .updateOne(
        {
          id:
            messageId,
        },
        {
          $set: {
            reactions:
              filtered,
          },
        },
      );

    return NextResponse.json({
      message:
        "Reaction added",
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
        "globalMessages",
      )
      .updateOne(
        {
          id:
            messageId,
        },
        {
          $pull: {
            reactions: {
              userId:
                payload.id,
            },
          },
        },
      );

    return NextResponse.json({
      message:
        "Reaction removed",
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