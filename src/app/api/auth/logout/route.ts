import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `token=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`
  );
  return res;
}
