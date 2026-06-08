import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Db } from "mongodb";

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function hashPassword(plain: string) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hashed: string) {
  return bcrypt.compareSync(plain, hashed);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function signToken(payload: Record<string, any>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS });
}

export function verifyToken(token: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jwt.verify(token, JWT_SECRET) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Obtain an auto-incrementing numeric id for a given collection name.
 * Uses a counters collection in the same database.
 */
export async function getNextId(db: Db, name: string) {
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: name } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  if (!result || !result.value) {
    throw new Error("Failed to generate ID");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result.value as any).seq as number;
}
