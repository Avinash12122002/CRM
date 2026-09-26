import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { logUserAction } from "@/lib/activity/audit";
import { verifyToken, getNextId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admin can create vacancies
    if (payload.role !== "admin") {
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
    const vacancyId = await getNextId(db, "vacancies");

    const vacancy = {
      vacancyId,
      jobTitle,
      description,
      status: "active",
      createdBy: payload.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("vacancies").insertOne(vacancy);

    await logUserAction(db, {
      userId: payload.id,
      userName: payload.name,
      userRole: payload.role,
      actionType: "vacancy_created",
      entityType: "vacancy",
      entityId: vacancyId,
      summary: `Created job vacancy: ${jobTitle.trim()}`,
      metadata: { jobTitle: jobTitle.trim() },
    });

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
