import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken, getNextId } from "@/lib/auth";

export async function GET() {
  try {
    const { db } =
      await connectToDatabase();

    const messages =
      await db
        .collection(
          "globalMessages",
        )
        .find({})
        .sort({
          createdAt: 1,
        })
        .toArray();

    return NextResponse.json({
      messages,
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
      message,
      type,
      fileId,
      fileName,
    } = body;

    const { db } =
      await connectToDatabase();

    const id =
      await getNextId(
        db,
        "globalMessages",
      );

    await db
      .collection(
        "globalMessages",
      )
      .insertOne({
        id,

        senderId:
          payload.id,

        senderName:
          payload.name,

        type:
          type || "text",

        message:
          message || "",

        fileId:
          fileId || null,

        fileName:
          fileName || null,

        reactions: [],

        createdAt:
          new Date(),
      });

    return NextResponse.json({
      message:
        "Global message sent",
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