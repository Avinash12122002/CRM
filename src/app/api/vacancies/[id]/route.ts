import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    jwt.verify(token, JWT_SECRET);

    const { id } = await params;
    const vacancyId = parseInt(id);

   const { db } = await connectToDatabase();
const vacanciesCollection = db.collection("vacancies");

    const vacancy = await vacanciesCollection
      .aggregate([
        { $match: { vacancyId } },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "id",
            as: "creator",
          },
        },
        {
          $project: {
            vacancyId: 1,
            description: 1,
            status: 1,
            createdBy: 1,
            createdAt: 1,
            updatedAt: 1,
            creatorName: { $arrayElemAt: ["$creator.name", 0] },
          },
        },
      ])
      .toArray();

    if (!vacancy || vacancy.length === 0) {
      return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
    }

    return NextResponse.json(vacancy[0]);
  } catch (error) {
    console.error("Error fetching vacancy:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Only admin can delete vacancies
    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const vacancyId = parseInt(id);

  const { db } = await connectToDatabase();
const vacanciesCollection = db.collection("vacancies");

    const result = await vacanciesCollection.deleteOne({ vacancyId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Vacancy deleted successfully" });
  } catch (error) {
    console.error("Error deleting vacancy:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
