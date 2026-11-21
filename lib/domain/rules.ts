import { z } from "zod";

export const PolicyRuleSchema = z
  .object({
    minimum_age: z.number().int().min(18).max(110),
    widow_required: z.boolean(),
    max_household_income_pkr: z.number().int().min(0).max(10_000_000),
    max_prior_mock_grants: z.number().int().min(0).max(10),
    allowed_districts: z.array(z.string().regex(/^[A-Z_]{3,40}$/)).min(1).max(20),
    required_proofs: z.array(z.string().regex(/^[A-Z_]{3,40}$/)).min(1).max(10),
    grant_amount_pkr: z.number().int().min(0).max(1_000_000),
    priority_if_dependents_at_least: z.number().int().min(0).max(40),
    confidence_thresholds: z
      .object({
        approve: z.number().min(0.85).max(1),
        ask_proof: z.number().min(0.6).max(1),
      })
      .strict(),
    loss_wrong_approval: z.number().positive(),
    loss_wait_for_review: z.number().positive(),
  })
  .strict();

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export type Predicate = { key: string; label: string; result: boolean | "UNKNOWN" };

export type EvidenceForRules = {
  ageYears: number | null;
  isWidow: boolean | null;
  householdIncomePkr: number | null;
  district: string | null;
  priorMockGrants: number | null;
  proofsProvided: string[];
};

const tri = (v: boolean | null): boolean | "UNKNOWN" => (v === null ? "UNKNOWN" : v);

/** Interprets the whitelisted DSL against evidence. No eval, no dynamic code. */
export function evaluatePredicates(rule: PolicyRule, ev: EvidenceForRules): Predicate[] {
  return [
    {
      key: "minimum_age",
      label: `Age at least ${rule.minimum_age}`,
      result: tri(ev.ageYears === null ? null : ev.ageYears >= rule.minimum_age),
    },
    {
      key: "widow_required",
      label: "Widow status",
      result: rule.widow_required ? tri(ev.isWidow) : true,
    },
    {
      key: "max_household_income_pkr",
      label: `Household income at most ${rule.max_household_income_pkr}`,
      result: tri(
        ev.householdIncomePkr === null
          ? null
          : ev.householdIncomePkr <= rule.max_household_income_pkr,
      ),
    },
    {
      key: "allowed_districts",
      label: "District in allowed list",
      result: tri(ev.district === null ? null : rule.allowed_districts.includes(ev.district)),
    },
    {
      key: "required_proofs",
      label: "Required proofs present",
      result: rule.required_proofs.every((p) => ev.proofsProvided.includes(p)),
    },
  ];
}

export function eligibilityScore(preds: Predicate[]) {
  const proven = preds.filter((p) => p.result === true).length;
  return preds.length === 0 ? 0 : proven / preds.length;
}

export function priorityFor(args: {
  householdSize: number | null;
  status: string;
  ageHours: number;
}) {
  const p =
    50 +
    20 * ((args.householdSize ?? 0) >= 3 ? 1 : 0) +
    20 * (args.status === "OFFICER_REVIEW" ? 1 : 0) +
    10 * (args.ageHours >= 24 ? 1 : 0) -
    10 * (args.status === "MORE_PROOF" ? 1 : 0);
  return Math.min(100, Math.max(0, p));
}
