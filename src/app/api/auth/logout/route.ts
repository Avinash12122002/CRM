import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `token=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`
  );
  return res;
}
