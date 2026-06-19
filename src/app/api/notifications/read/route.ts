import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function PUT(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const {
      notificationId,
    } = body;

    const { db } =
      await connectToDatabase();

    await db
      .collection(
        "notifications",
      )
      .updateOne(
        {
          id:
            notificationId,
        },
        {
          $set: {
            read: true,
          },
        }
      );

    return NextResponse.json({
      message:
        "Notification read",
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