import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      role: string;
    };

    // Only admin can create vacancies
    if (decoded.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { jobTitle, description } = await request.json();

    if (!jobTitle || !jobTitle.trim()) {
      return NextResponse.json(
        { error: "Job title is required" },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

const { db } = await connectToDatabase();

const vacanciesCollection = db.collection("vacancies");

// Get the next vacancy ID
const counterCollection = db.collection("counters");
    const counter = await counterCollection.findOneAndUpdate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: "vacancies" } as any,
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );

    if (!counter || !counter.value) {
      throw new Error("Failed to generate vacancy ID");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vacancyId = (counter.value as any).seq;

    const vacancy = {
      vacancyId,
      jobTitle,
      description,
      status: "active",
      createdBy: decoded.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await vacanciesCollection.insertOne(vacancy);

    return NextResponse.json(
      { message: "Vacancy created successfully", vacancyId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating vacancy:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
