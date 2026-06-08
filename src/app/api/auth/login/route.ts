import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifyPassword, signToken, getNextId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne({ username });
    if (!user) {
      return NextResponse.json(
        {
          message: "User not found",
        },
        { status: 401 }
      );
    }

    const ok = verifyPassword(password, user.password_hash);
    if (!ok) {
  return NextResponse.json(
    { message: "Invalid credentials", here: "password not ok" },
    { status: 401 }
  );
}

    // Fix for users created before getNextId was fixed
    let userId = user.id;
    if (!userId) {
      userId = await getNextId(db, "users");
      await db
        .collection("users")
        .updateOne({ _id: user._id }, { $set: { id: userId } });
    }

    const token = signToken({
      id: userId,
      role: user.role,
      name: user.name,
      username: user.username,
    });

    // Set HttpOnly cookie
    const res = NextResponse.json({ ok: true });
    res.headers.append(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=${
        60 * 60 * 24 * 7
      }; SameSite=Strict; Secure`
    );
    return res;
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: "Server error", error: errorMessage },
      { status: 500 }
    );
  }
}
