// Billing module — shared constants

export const BILLING_ROLE = "billing";
export const BILLING_ROLES = ["admin", "billing", "telecaller"];
export const BILLING_COLLECTION = "billinginvoices";

// Used whenever comparing money amounts to avoid floating point issues.
export const AMOUNT_EPSILON = 0.01;

export const BILLING_TEMPLATE = {
  orgName: "THE MIGRATION SCHOOL",
  accountNumber: "50200098047844",
  bank: "HDFC",
  ifsc: "HDFC0000325",
  upiId: "9992919202.1@hdfc",
  defaultDescription: "Australia Embassy Fees Charge",
  defaultAmount: 17000,
};

export type BillStatus = "unpaid" | "partial" | "paid";

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Single source of truth for a bill's status. Never trust a stored `paid`
 * boolean on its own — always derive status from amount vs paidAmount so the
 * badge, the buttons, and the PDFs can never disagree with each other.
 */
export function getBillStatus(amount: number, paidAmount: number): BillStatus {
  const remaining = Math.max(round2(amount - paidAmount), 0);
  if (remaining <= AMOUNT_EPSILON) return "paid";
  if (paidAmount > AMOUNT_EPSILON) return "partial";
  return "unpaid";
}