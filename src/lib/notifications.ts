import { connectToDatabase } from "@/lib/mongodb";
import { getNextId } from "@/lib/auth";

interface CreateNotificationParams {
  userId: number;

  title: string;

  message: string;

  type?: string;

  link?: string | null;
}

export async function createNotification({
  userId,
  title,
  message,
  type = "general",
  link = null,
}: CreateNotificationParams) {
  const { db } =
    await connectToDatabase();

  const id =
    await getNextId(
      db,
      "notifications",
    );

  await db
    .collection(
      "notifications",
    )
    .insertOne({
      id,

      userId,

      title,

      message,

      type,

      link,

      read: false,

      createdAt:
        new Date(),
    });

  return id;
}