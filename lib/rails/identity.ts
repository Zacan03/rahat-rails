import { compareNames } from "@/lib/domain/identity-match";
import { indexOfDemoId, recordFor } from "@/lib/rails/fixtures";

export type IdentityRequest = {
  demoIdentityId: string;
  claimedName: string | null;
  claimedAge: number | null;
  claimedHouseholdSize: number | null;
};

export type IdentityResult = {
  matchStatus: "MATCH" | "FUZZY" | "MISMATCH" | "UNAVAILABLE";
  /** The `I` factor in [0,1]. */
  factor: number;
  nameAmbiguity: boolean;
  corroboration: { age: boolean; household: boolean };
  candidateIds: string[];
  simulated: true;
};

/**
 * MOCK identity rail. Name matching only proposes a candidate; identity requires the
 * same DEMO id plus independent corroboration (age and household). Never a real NADRA call.
 */
export function mockVerifyIdentity(req: IdentityRequest): IdentityResult {
  const n = indexOfDemoId(req.demoIdentityId);
  if (n === null || !req.claimedName) {
    return {
      matchStatus: "UNAVAILABLE",
      factor: 0,
      nameAmbiguity: false,
      corroboration: { age: false, household: false },
      candidateIds: [],
      simulated: true,
    };
  }
  const rec = recordFor(n);
  const name = compareNames(req.claimedName, rec.storedName, rec.nameVariants);
  const age = req.claimedAge !== null && req.claimedAge === rec.ageYears;
  const household = req.claimedHouseholdSize !== null && req.claimedHouseholdSize === rec.householdSize;
  const corroborations = Number(age) + Number(household);
  const nameOk = name.exact || name.aliasOnly || name.similarity >= 0.6;

  let matchStatus: IdentityResult["matchStatus"];
  let factor: number;
  if (nameOk && corroborations === 2) {
    matchStatus = "MATCH";
    factor = 1;
  } else if (nameOk && corroborations === 1) {
    matchStatus = "FUZZY";
    factor = 0.75;
  } else {
    matchStatus = "MISMATCH";
    factor = 0.2;
  }
  return {
    matchStatus,
    factor,
    nameAmbiguity: !name.exact && nameOk && corroborations === 0,
    corroboration: { age, household },
    candidateIds: nameOk ? [rec.demoIdentityId] : [],
    simulated: true,
  };
}
