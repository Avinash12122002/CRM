import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const cookie = req.headers.get("cookie") || "";
    const matches = cookie.match(/(^|; )token=([^;]+)/);
    const token = matches ? matches[2] : null;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Only admins can delete users
    if (payload.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const userId = parseInt(params.id);

    // Prevent admin from deleting themselves
    if (userId === payload.id) {
      return NextResponse.json(
        { message: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Delete the user
    await db.collection("users").deleteOne({ id: userId });

    // Unassign leads that were assigned to this user across all collections
    const userFilter = { $or: [{ assignedTo: userId }, { assignedTo: String(userId) }] };
    await Promise.all([
      db.collection("leads").updateMany(userFilter, {
        $set: {
          assignedTo: null,
          assignedToName: null,
          assignedToRole: null,
        },
      }),
      db.collection("triloknath_leads").updateMany(userFilter, {
        $set: {
          assignedTo: null,
          assignedToName: null,
          assignedToRole: null,
        },
      }),
      db.collection("bdleads").updateMany(userFilter, {
        $set: {
          assignedTo: null,
          assignedToName: null,
        },
      }),
    ]);
    return NextResponse.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
