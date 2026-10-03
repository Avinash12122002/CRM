export type FollowUpStage =
  | "info"
  | "agreement"
  | "invoice"
  | "payment_confirmation"
  | "case_manager";

export interface StageRecord {
  sentAt: string | Date;
  sentBy: number;
  sentByName: string;
  method: "manual_gmail" | "marked";
  note?: string;
}

export interface FollowUpWorkflowState {
  currentStage: FollowUpStage | "completed";
  status: "in_progress" | "completed" | "not_interested";
  stages: Partial<Record<FollowUpStage, StageRecord>>;
  nextFollowupAt: string | Date | null;
  notInterestedAt?: string | Date;
  notInterestedBy?: number;
  notInterestedByName?: string;
  updatedAt: string | Date;
}

export interface StageConfig {
  key: FollowUpStage;
  label: string;
  mailbox: string;
  defaultSubject: string;
  daysToNext: number; // 2 for info, agreement, invoice; 0 for payment_confirmation and case_manager
  nextStage: FollowUpStage | "completed";
  description: string;
}

export const FOLLOW_UP_STAGE_CONFIGS: Record<FollowUpStage, StageConfig> = {
  info: {
    key: "info",
    label: "Info Mail",
    mailbox: "info@tmsvisa.com",
    defaultSubject: "TMS Visa — Australia Migration Consultation Details & Next Steps",
    daysToNext: 2,
    nextStage: "agreement",
    description: "Send consultation recap, migration program details, and initial documents.",
  },
  agreement: {
    key: "agreement",
    label: "Agreement Mail",
    mailbox: "compliance@tmsvisa.com",
    defaultSubject: "TMS Visa — Client Service Agreement & Compliance Guidelines",
    daysToNext: 2,
    nextStage: "invoice",
    description: "Send service agreement contract, terms of engagement, and signature instructions.",
  },
  invoice: {
    key: "invoice",
    label: "Invoice Mail",
    mailbox: "sales@tmsvisa.com",
    defaultSubject: "TMS Visa — Official Service Invoice & Bank Remittance Details",
    daysToNext: 2,
    nextStage: "payment_confirmation",
    description: "Send formal invoice with bank details, UPI ID, and payment schedule.",
  },
  payment_confirmation: {
    key: "payment_confirmation",
    label: "Payment Confirmation Mail",
    mailbox: "sales@tmsvisa.com",
    defaultSubject: "TMS Visa — Payment Received & Welcome to the Migration Program",
    daysToNext: 0, // 2-day cycle breaks! Sale completed
    nextStage: "case_manager",
    description: "Confirm receipt of payment and onboard client. 2-day follow-up cycle breaks here.",
  },
  case_manager: {
    key: "case_manager",
    label: "Case Manager Email",
    mailbox: "sumit.recruiter@tmsvisa.com",
    defaultSubject: "TMS Visa — Introduction to Your Dedicated Case Manager",
    daysToNext: 0,
    nextStage: "completed",
    description: "Introduce candidate to their assigned Case Manager team for CV marketing.",
  },
};

export const FOLLOW_UP_STAGES_LIST: FollowUpStage[] = [
  "info",
  "agreement",
  "invoice",
  "payment_confirmation",
  "case_manager",
];

/**
 * Generates clean plain text template for manual Gmail composition
 */
export function getFollowUpEmailDraft(
  stage: FollowUpStage,
  candidateName: string
): { subject: string; body: string } {
  const config = FOLLOW_UP_STAGE_CONFIGS[stage];
  const name = candidateName || "Candidate";

  let body = "";

  switch (stage) {
    case "info":
      body = `Dear ${name},

Thank you for attending the migration consultation with The Migration School (TMS Visa).

As discussed during your meeting, our consultants have evaluated your profile for Australian migration pathways. We are pleased to provide you with the initial consultation roadmap and program details.

Next Step:
Our compliance desk is preparing your Client Service Agreement. We will follow up with you regarding the agreement document.

If you have any questions, please feel free to reply to this email.

Warm regards,
The Migration School (TMS Visa)
Website: www.tmsvisa.com`;
      break;

    case "agreement":
      body = `Dear ${name},

Following our consultation, please find the TMS Visa Client Service Agreement for your review.

This agreement outlines the service scope, visa application milestones, and our mutual obligations.

Action Required:
Please review the terms of engagement. Once acknowledged, our billing desk will issue your official service invoice.

Sincerely,
Compliance & Legal Team
The Migration School (TMS Visa)`;
      break;

    case "invoice":
      body = `Dear ${name},

Thank you for proceeding with The Migration School (TMS Visa). Your service invoice has been generated for your migration consulting program.

Bank Remittance Details:
- Beneficiary Name: THE MIGRATION SCHOOL
- Bank: HDFC Bank
- Account Type: Current Account
- UPI ID: tmsvisa@hdfcbank

Once your payment is completed, please reply with your transaction screenshot or UTR number so our accounts team can confirm receipt.

Best regards,
Accounts & Billing Desk
The Migration School (TMS Visa)`;
      break;

    case "payment_confirmation":
      body = `Dear ${name},

We are delighted to confirm that your payment has been successfully received and verified!

Welcome to The Migration School! Your migration file is now formally activated into our active candidate pool.

What happens next?
You will shortly receive an introductory email connecting you with your dedicated Case Manager, who will coordinate your CV optimization and employer marketing outreach.

Warm congratulations and welcome aboard,
The Migration School (TMS Visa)`;
      break;

    case "case_manager":
      body = `Dear ${name},

We are pleased to introduce you to your dedicated Case Manager at The Migration School (TMS Visa).

Your Case Manager will be directly responsible for:
1. Aligning and optimizing your CV according to Australian ANZSCO industry standards
2. Executing employer outreach (Job Boards, Core Employers, Industry Directories)
3. Coordinating interview schedules and correspondence

Your Case Manager will be in touch shortly to begin your profile file review.

Best wishes for your Australian journey,
Case Management Team
The Migration School (TMS Visa)`;
      break;
  }

  return {
    subject: config.defaultSubject,
    body,
  };
}

/**
 * Helper to build direct Gmail Web compose link
 */
export function buildGmailComposeUrl(
  toEmail: string,
  subject: string,
  body: string
): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: toEmail || "",
    su: subject || "",
    body: body || "",
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Calculates updated followUpWorkflow state upon manually marking a stage as sent
 */
export function calculateNextWorkflowState(
  currentState: Partial<FollowUpWorkflowState> | undefined,
  completedStage: FollowUpStage,
  user: { id: number; name: string },
  note?: string
): FollowUpWorkflowState {
  const now = new Date();
  const config = FOLLOW_UP_STAGE_CONFIGS[completedStage];

  const currentStages = currentState?.stages || {};
  const updatedStages: Partial<Record<FollowUpStage, StageRecord>> = {
    ...currentStages,
    [completedStage]: {
      sentAt: now,
      sentBy: user.id,
      sentByName: user.name,
      method: "manual_gmail",
      note: note || undefined,
    },
  };

  const nextStage = config.nextStage;

  let nextFollowupAt: Date | null = null;
  let status: "in_progress" | "completed" | "not_interested" = "in_progress";

  if (config.daysToNext > 0) {
    // 2-day reminder cycle until next stage is marked sent
    nextFollowupAt = new Date(now.getTime() + config.daysToNext * 24 * 60 * 60 * 1000);
  } else {
    // 2-day cycle breaks (payment_confirmation or case_manager)
    nextFollowupAt = null;
  }

  if (nextStage === "completed") {
    status = "completed";
  }

  return {
    currentStage: nextStage,
    status,
    stages: updatedStages,
    nextFollowupAt,
    updatedAt: now,
  };
}
