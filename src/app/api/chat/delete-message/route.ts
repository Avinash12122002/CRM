import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function DELETE(
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

    const body =
      await req.json();

    const { messageId } =
      body;

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
          message:
            "Message not found",
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
          message:
            "Forbidden",
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
            deleted: true,
            message:
              "This message was deleted",
          },
        }
      );

    return NextResponse.json({
      message:
        "Deleted",
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