import { AppError } from "@/lib/errors";

export type CaseStatus =
  | "DRAFT" | "SUBMITTED" | "CHECKING" | "MORE_PROOF" | "OFFICER_REVIEW"
  | "AUTO_APPROVED" | "OFFICER_APPROVED" | "REJECTED" | "MOCK_PAID"
  | "ESCALATED" | "CLOSED" | "CONSENT_WITHDRAWN";

const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["CHECKING"],
  CHECKING: ["AUTO_APPROVED", "MORE_PROOF", "OFFICER_REVIEW"],
  AUTO_APPROVED: ["MOCK_PAID"],
  MOCK_PAID: ["CLOSED"],
  MORE_PROOF: ["SUBMITTED"],
  OFFICER_REVIEW: ["OFFICER_APPROVED", "MORE_PROOF", "REJECTED", "ESCALATED"],
  OFFICER_APPROVED: ["MOCK_PAID"],
  ESCALATED: ["OFFICER_REVIEW", "CLOSED"],
  REJECTED: ["CLOSED"],
  CONSENT_WITHDRAWN: ["CLOSED"],
  CLOSED: [],
};

const TERMINAL: readonly CaseStatus[] = ["CLOSED", "CONSENT_WITHDRAWN"];

export function canTransition(from: CaseStatus, to: CaseStatus) {
  if (to === "CONSENT_WITHDRAWN") return !TERMINAL.includes(from);
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CaseStatus, to: CaseStatus) {
  if (!canTransition(from, to)) throw new AppError(409, "ILLEGAL_TRANSITION");
}
