import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { assertTransition, canTransition } from "@/lib/domain/case-machine";
import { PolicyRuleSchema, eligibilityScore, evaluatePredicates } from "@/lib/domain/rules";
import { compareNames, normalizeName } from "@/lib/domain/identity-match";
import { mockVerifyIdentity } from "@/lib/rails/identity";
import { mockDisburse } from "@/lib/rails/payment";
import { FAMILY_COUNT, claimTemplateFor, demoId, recordFor } from "@/lib/rails/fixtures";
import { calculateConfidence, decide } from "@/lib/domain/confidence";

const v1 = {
  minimum_age: 18, widow_required: true, max_household_income_pkr: 35000, max_prior_mock_grants: 0,
  allowed_districts: ["KARACHI_DEMO"], required_proofs: ["DEMO_ID", "WIDOWHOOD_ATTESTATION"],
  grant_amount_pkr: 12000, priority_if_dependents_at_least: 2,
  confidence_thresholds: { approve: 0.85, ask_proof: 0.6 }, loss_wrong_approval: 20, loss_wait_for_review: 3,
};

describe("case state machine", () => {
  it("allows the golden path and rejects illegal jumps with 409", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("CHECKING", "AUTO_APPROVED")).toBe(true);
    expect(canTransition("AUTO_APPROVED", "MOCK_PAID")).toBe(true);
    expect(canTransition("DRAFT", "MOCK_PAID")).toBe(false);
    expect(canTransition("OFFICER_REVIEW", "MOCK_PAID")).toBe(false);
    expect(() => assertTransition("CLOSED", "SUBMITTED")).toThrow(AppError);
  });
  it("allows consent withdrawal from non-terminal states only", () => {
    expect(canTransition("OFFICER_REVIEW", "CONSENT_WITHDRAWN")).toBe(true);
    expect(canTransition("CLOSED", "CONSENT_WITHDRAWN")).toBe(false);
  });
});

describe("policy DSL", () => {
  it("rejects unknown keys and weakened thresholds", () => {
    expect(PolicyRuleSchema.safeParse({ ...v1, eval: "1+1" }).success).toBe(false);
    expect(PolicyRuleSchema.safeParse({ ...v1, confidence_thresholds: { approve: 0.8, ask_proof: 0.6 } }).success).toBe(false);
    expect(PolicyRuleSchema.safeParse(v1).success).toBe(true);
  });
  it("treats missing evidence as UNKNOWN, not true", () => {
    const rule = PolicyRuleSchema.parse(v1);
    const preds = evaluatePredicates(rule, {
      ageYears: 40, isWidow: null, householdIncomePkr: 1000, district: "KARACHI_DEMO",
      priorMockGrants: 0, proofsProvided: ["DEMO_ID"],
    });
    expect(preds.find((p) => p.key === "widow_required")?.result).toBe("UNKNOWN");
    expect(eligibilityScore(preds)).toBeCloseTo(0.6, 5);
  });
});

describe("identity matching", () => {
  it("suggests Muhammad/Mohammad/Muhammed aliases but never merges on name alone", () => {
    expect(normalizeName("Mohammad Ali")).toBe(normalizeName("Muhammed Ali"));
    const m = compareNames("Muhammad Rahat Bibi", "Mohammad Rahat Bibi", []);
    expect(m.exact).toBe(false);
    expect(m.aliasOnly).toBe(true);
    const r = mockVerifyIdentity({ demoIdentityId: "DEMO-WD-001", claimedName: "Muhammad Rahat Bibi (Demo 001)", claimedAge: null, claimedHouseholdSize: null });
    expect(r.matchStatus).toBe("MISMATCH"); // alias without corroboration is not identity
  });
  it("matches DEMO-WD-001 only with corroboration (age + household)", () => {
    const t = claimTemplateFor(1);
    const r = mockVerifyIdentity({ demoIdentityId: "DEMO-WD-001", claimedName: t.claimedName, claimedAge: t.ageYears, claimedHouseholdSize: t.householdSize });
    expect(r.matchStatus).toBe("MATCH");
  });
  it("returns UNAVAILABLE, never MATCH, for unknown ids", () => {
    expect(mockVerifyIdentity({ demoIdentityId: "DEMO-X-1", claimedName: "A", claimedAge: 1, claimedHouseholdSize: 1 }).matchStatus).toBe("UNAVAILABLE");
  });
});

describe("mock payment rail", () => {
  it("is idempotent per case id and clearly simulated", () => {
    const a = mockDisburse({ caseId: "c1", amountPkr: 12000 });
    const b = mockDisburse({ caseId: "c1", amountPkr: 12000 });
    expect(a.reference).toBe(b.reference);
    expect(a.reference).toMatch(/^MOCK-RAAST-[0-9A-F]{12}$/);
    expect(mockDisburse({ caseId: "c2", amountPkr: 12000 }).reference).not.toBe(a.reference);
  });
});

describe("synthetic fixtures", () => {
  it("has 40 families with only DEMO ids", () => {
    expect(FAMILY_COUNT).toBe(40);
    for (let n = 1; n <= 40; n++) expect(demoId(n)).toMatch(/^DEMO-[A-Z0-9-]+$/);
    expect(recordFor(1).nameVariants.some((v) => v.startsWith("Muhammad"))).toBe(true);
  });
});

/** Re-derives the live scoring pipeline from fixtures to prove the three demo branches. */
describe("end-to-end fixture scenarios (pure)", () => {
  const rule = PolicyRuleSchema.parse(v1);
  function run(n: number) {
    const rec = recordFor(n);
    const t = claimTemplateFor(n);
    const id = mockVerifyIdentity({ demoIdentityId: demoId(n), claimedName: t.claimedName, claimedAge: t.ageYears, claimedHouseholdSize: t.householdSize });
    const preds = evaluatePredicates(rule, {
      ageYears: rec.ageYears, isWidow: t.widowAttested ? rec.isWidow : false, householdIncomePkr: rec.householdIncomePkr,
      district: rec.district, priorMockGrants: 0, proofsProvided: t.proofs,
    });
    const filled = [t.claimedName, t.ageYears, t.householdSize, t.householdIncomePkr, t.district].filter((x) => x !== null).length;
    const f = { I: id.factor, E: eligibilityScore(preds), D: rec.docQuality, U: rec.dupSafety, S: rec.channelSafety, F: filled / 5 };
    const c = calculateConfidence(f, { nameAmbiguity: id.nameAmbiguity, unverifiedSender: false, tamperSuspected: rec.docStatus === "TAMPER_SUSPECTED" }).confidence;
    const gates = id.matchStatus === "MATCH" && rec.dupStatus === "NONE" && rec.docStatus === "PASS" && preds.every((p) => p.result === true);
    return { c, d: decide(c, gates) };
  }
  it("DEMO-WD-001 => 0.92 AUTO_APPROVED", () => expect(run(1)).toEqual({ c: 0.92, d: "AUTO_APPROVED" }));
  it("DEMO-WD-004 => 0.73 MORE_PROOF", () => expect(run(4)).toEqual({ c: 0.73, d: "MORE_PROOF" }));
  it("DEMO-WD-002 => 0.44 OFFICER_REVIEW", () => expect(run(2)).toEqual({ c: 0.44, d: "OFFICER_REVIEW" }));
  it("DEMO-WD-003 (duplicate + tamper) is never paid", () => expect(run(3).d).toBe("OFFICER_REVIEW"));
});
