export const THRESHOLD_APPROVE = 0.85;
export const THRESHOLD_ASK_PROOF = 0.6;
export const LOSS_WRONG_APPROVAL = 20;
export const LOSS_MANUAL_DELAY = 3;

export type Factors = {
  I: number; // identity agreement
  E: number; // policy eligibility evidence
  D: number; // document quality/integrity
  U: number; // uniqueness/duplicate safety
  S: number; // scam/channel safety
  F: number; // completeness
};

export type RiskFlags = {
  nameAmbiguity: boolean;
  unverifiedSender: boolean;
  tamperSuspected: boolean;
};

export type Decision = "AUTO_APPROVED" | "MORE_PROOF" | "OFFICER_REVIEW";

const WEIGHTS = { I: 0.3, E: 0.25, D: 0.15, U: 0.15, S: 0.1, F: 0.05 } as const;

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function calculateConfidence(factors: Factors, flags: RiskFlags) {
  const values = Object.values(factors);
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
    return { confidence: NaN, base: NaN, penalty: NaN };
  }
  const base =
    WEIGHTS.I * factors.I +
    WEIGHTS.E * factors.E +
    WEIGHTS.D * factors.D +
    WEIGHTS.U * factors.U +
    WEIGHTS.S * factors.S +
    WEIGHTS.F * factors.F;
  const penalty =
    0.1 * (flags.nameAmbiguity ? 1 : 0) +
    0.1 * (flags.unverifiedSender ? 1 : 0) +
    0.15 * (flags.tamperSuspected ? 1 : 0);
  return {
    confidence: round4(clamp(base - penalty, 0, 1)),
    base: round4(base),
    penalty: round4(penalty),
  };
}

export function decide(confidence: number, hardGatesPass: boolean): Decision {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return "OFFICER_REVIEW";
  }
  if (confidence >= THRESHOLD_APPROVE && hardGatesPass) return "AUTO_APPROVED";
  if (confidence >= THRESHOLD_ASK_PROOF && confidence < THRESHOLD_APPROVE) {
    return "MORE_PROOF";
  }
  // High confidence with a failed hard gate is NEVER auto-approved.
  return "OFFICER_REVIEW";
}

export function expectedLosses(confidence: number) {
  return {
    expectedWrongApprovalLoss: round4((1 - confidence) * LOSS_WRONG_APPROVAL),
    expectedManualDelayLoss: LOSS_MANUAL_DELAY,
  };
}

export const NOT_SURE_EN = "I am not sure — a department officer will review this case.";
export const NOT_SURE_UR =
  "مجھے یقین نہیں ہے — محکمے کا ایک افسر اس کیس کا جائزہ لے گا۔";

/** Fixtures from SPEC §4 — asserted by tests, never injected by route handlers. */
export const DEMO_FIXTURES = {
  A: { factors: { I: 1, E: 1, D: 0.8, U: 0.8, S: 0.8, F: 1 }, expected: 0.92 },
  B: { factors: { I: 0.75, E: 0.8, D: 0.7, U: 0.8, S: 0.5, F: 0.6 }, expected: 0.73 },
  C: { factors: { I: 0.2, E: 0.6, D: 0.4, U: 0.4, S: 0.7, F: 0.8 }, expected: 0.44 },
} as const;
