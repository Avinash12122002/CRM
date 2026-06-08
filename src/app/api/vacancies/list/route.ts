import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    jwt.verify(token, JWT_SECRET);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const { db } = await connectToDatabase();
    const vacanciesCollection = db.collection("vacancies");

    // Build match query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchQuery: any = {};
    if (search) {
      matchQuery.$or = [
        { jobTitle: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (status) {
      matchQuery.status = status;
    }

    // Get total count for pagination
    const totalVacancies = await vacanciesCollection.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalVacancies / limit);

    // Fetch vacancies with pagination
    const vacancies = await vacanciesCollection
      .aggregate([
        { $match: matchQuery },
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
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
            jobTitle: 1,
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

    return NextResponse.json({
      vacancies,
      pagination: {
        page: page,
        limit: limit,
        totalVacancies: totalVacancies,
        totalPages: totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching vacancies:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
