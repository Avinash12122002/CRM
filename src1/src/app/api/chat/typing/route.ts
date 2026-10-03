import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function POST(
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
        {
          message: "Unauthorized",
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
          message: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      await req.json();

    const {
      conversationId,
      typing,
    } = body;

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "typingStatus",
      )
      .updateOne(
        {
          conversationId,
          userId:
            payload.id,
        },
        {
          $set: {
            conversationId,
            userId:
              payload.id,
            userName:
              payload.name,
            typing,
            updatedAt:
              new Date(),
          },
        },
        {
          upsert: true,
        },
      );

    return NextResponse.json({
      message:
        "Typing updated",
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
  req: NextRequest
) {
  try {
    const conversationId =
      Number(
        new URL(req.url)
          .searchParams.get(
            "conversationId",
          ),
      );

    const { db } =
      await connectToDatabase();

    const typingUsers =
      await db
        .collection(
          "typingStatus",
        )
        .find({
          conversationId,
          typing: true,
        })
        .toArray();

    return NextResponse.json({
      typingUsers,
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