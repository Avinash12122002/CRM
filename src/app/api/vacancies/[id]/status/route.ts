import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      role: string;
    };

    // Only admin can update vacancy status
    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const vacancyId = parseInt(id);
    const { status } = await request.json();

    if (!status || (status !== "active" && status !== "inactive")) {
      return NextResponse.json(
        { error: "Status must be either 'active' or 'inactive'" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const vacanciesCollection = db.collection("vacancies");

    const result = await vacanciesCollection.updateOne(
      { vacancyId },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Vacancy status updated successfully",
    });
  } catch (error) {
    console.error("Error updating vacancy status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
