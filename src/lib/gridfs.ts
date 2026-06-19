import { GridFSBucket } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

let bucket: GridFSBucket | null = null;

export async function getGridFSBucket() {
  if (bucket) {
    return bucket;
  }

  const { db } =
    await connectToDatabase();

  bucket =
    new GridFSBucket(db, {
      bucketName:
        "chatFiles",
    });

  return bucket;
}