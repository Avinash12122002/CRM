import type { NextRequest } from "next/server";
import type { Db } from "mongodb";
import { verifyToken } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthPayload = Record<string, any>;

export function getTokenPayload(req: NextRequest): AuthPayload | null {
  const cookie = req.headers.get("cookie") || "";
  const matches = cookie.match(/(^|; )token=([^;]+)/);
  const token = matches ? matches[2] : null;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Confirms the requesting user is allowed to work on this candidate's
 * CV Marketing Workspace: a case manager may only touch candidates
 * currently assigned to them; an admin may touch any candidate lead.
 */
export async function getAuthorizedCandidateLead(
  db: Db,
  leadId: number,
  payload: AuthPayload,
) {
  if (payload.role !== "case_manager" && payload.role !== "admin") {
    return { error: "Forbidden", status: 403 as const, lead: null };
  }

  const lead = await db.collection("leads").findOne({ id: leadId });
  if (!lead) {
    return { error: "Candidate lead not found", status: 404 as const, lead: null };
  }

  if (payload.role === "case_manager" && lead.assignedTo !== payload.id) {
    return { error: "Forbidden", status: 403 as const, lead: null };
  }

  return { error: null, status: 200 as const, lead };
}
