// Billing module — shared constants
// New module. Does not touch any existing collection.

// Role used for the dedicated Billing user (creates invoices only).
export const BILLING_ROLE = "billing";

// Roles allowed to use the Billing module (create bills, view own history).
// Admin also has full access (sees every biller's bills + Billing Analysis).
export const BILLING_ROLES = ["admin", "billing"];

export const BILLING_COLLECTION = "billinginvoices";

// Fixed payment/template details — snapshotted onto every invoice at
// creation time so historical receipts stay accurate even if these ever
// change in the future.
export const BILLING_TEMPLATE = {
  orgName: "THE MIGRATION SCHOOL",
  accountNumber: "50200098047844",
  bank: "HDFC",
  ifsc: "HDFC0000325",
  upiId: "9992919202.1@hdfc",
  defaultDescription: "Australia Embassy Fees Charge",
  defaultAmount: 17000,
};
