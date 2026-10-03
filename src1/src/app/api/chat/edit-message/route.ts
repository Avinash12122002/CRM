import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      messageId,
      message,
    } = body;

    const { db } =
      await connectToDatabase();

    const existing =
      await db
        .collection("messages")
        .findOne({
          id: messageId,
        });

    if (!existing) {
      return NextResponse.json(
        {
          message: "Message not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      existing.senderId !==
      payload.id
    ) {
      return NextResponse.json(
        {
          message: "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    await db
      .collection("messages")
      .updateOne(
        {
          id: messageId,
        },
        {
          $set: {
            message,
            edited: true,
            editedAt:
              new Date(),
          },
        }
      );

    return NextResponse.json({
      message:
        "Message updated",
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
      }
    );
  }
}