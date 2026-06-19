import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  verifyToken,
  getNextId,
} from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      leadId: string;
    }>;
  }
) {
  try {
    const cookie =
      req.headers.get(
        "cookie"
      ) || "";

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
        }
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
        }
      );
    }

    const params =
      await context.params;

    const leadId =
      parseInt(
        params.leadId
      );

    const { db } =
      await connectToDatabase();

    const messages =
      await db
        .collection(
          "leadChats"
        )
        .find({
          leadId,
        })
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
      }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{
      leadId: string;
    }>;
  }
) {
  try {
    const params =
      await context.params;

    const cookie =
      req.headers.get(
        "cookie"
      ) || "";

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
        }
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
        }
      );
    }

    const body =
      await req.json();

    const { message } =
      body;

    const leadId =
      parseInt(
        params.leadId
      );

    const { db } =
      await connectToDatabase();

    const id =
      await getNextId(
        db,
        "leadChats",
      );

    await db
      .collection(
        "leadChats",
      )
      .insertOne({
        id,

        leadId,

        senderId:
          payload.id,

        senderName:
          payload.name,

        message,

        createdAt:
          new Date(),
      });

    return NextResponse.json({
      message:
        "Lead message sent",
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