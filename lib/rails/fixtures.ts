/**
 * SYNTHETIC mock-rail fixtures. Names, ages and IDs are fictional.
 * No real CNIC, NADRA record, phone number or bank detail exists here.
 */
export type DupStatus = "NONE" | "POSSIBLE" | "CONFIRMED";
export type DocStatus = "PASS" | "BLURRY" | "TAMPER_SUSPECTED" | "MISSING";

export type MockRecord = {
  demoIdentityId: string;
  storedName: string;
  nameVariants: string[];
  ageYears: number;
  isWidow: boolean | null;
  householdIncomePkr: number;
  householdSize: number;
  district: string;
  priorMockGrants: number;
  docStatus: DocStatus;
  docQuality: number; // D factor
  dupStatus: DupStatus;
  dupSafety: number; // U factor
  channelSafety: number; // S factor
  unverifiedSender: boolean;
};

export type ClaimTemplate = {
  claimedName: string;
  ageYears: number | null;
  householdSize: number | null;
  householdIncomePkr: number | null;
  district: string | null;
  widowAttested: boolean;
  proofs: string[];
};

export const FAMILY_COUNT = 40;
const FIRST = [
  "Amina", "Zainab", "Fatima", "Khadija", "Sakina", "Hajra", "Noor", "Rubina",
  "Shabana", "Mehnaz", "Sumaira", "Nasreen", "Farida", "Shaista", "Tahira", "Bushra",
  "Samina", "Parveen", "Rukhsana", "Gulshan",
];
const LAST = ["Bibi", "Khatoon", "Begum", "Bano"];

export function demoId(n: number) {
  return `DEMO-WD-${String(n).padStart(3, "0")}`;
}

export function indexOfDemoId(id: string): number | null {
  const m = /^DEMO-WD-(\d{3})$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= FAMILY_COUNT ? n : null;
}

const ALL_PROOFS = ["DEMO_ID", "WIDOWHOOD_ATTESTATION"];

export function recordFor(n: number): MockRecord {
  const base: MockRecord = {
    demoIdentityId: demoId(n),
    storedName: `${FIRST[(n - 1) % FIRST.length]} ${LAST[(n - 1) % LAST.length]} (Demo ${String(n).padStart(3, "0")})`,
    nameVariants: [],
    ageYears: 30 + ((n * 3) % 25),
    isWidow: true,
    householdIncomePkr: 15000 + ((n * 700) % 15000),
    householdSize: 2 + (n % 5),
    district: "KARACHI_DEMO",
    priorMockGrants: 0,
    docStatus: "PASS",
    docQuality: 1,
    dupStatus: "NONE",
    dupSafety: 1,
    channelSafety: 1,
    unverifiedSender: false,
  };
  if (n === 1) {
    return {
      ...base,
      storedName: "Mohammad Rahat Bibi (Demo 001)",
      nameVariants: ["Muhammad Rahat Bibi (Demo 001)", "Muhammed Rahat Bibi (Demo 001)"],
      ageYears: 42,
      householdSize: 4,
      householdIncomePkr: 18000,
      docQuality: 0.8,
      dupSafety: 0.8,
      channelSafety: 0.8,
    };
  }
  if (n === 2) {
    // Low-confidence / conflicting record: age on record disagrees, widow status unknown.
    return {
      ...base,
      storedName: "Zainab Khatoon (Demo 002)",
      ageYears: 47,
      isWidow: null,
      householdSize: 5,
      docStatus: "MISSING",
      docQuality: 0.4,
      dupStatus: "POSSIBLE",
      dupSafety: 0.4,
      channelSafety: 0.7,
    };
  }
  if (n === 3) {
    // Conflicting DOB + duplicate flag.
    return {
      ...base,
      storedName: "Fatima Begum (Demo 003)",
      dupStatus: "CONFIRMED",
      dupSafety: 0,
      docStatus: "TAMPER_SUSPECTED",
      docQuality: 0,
    };
  }
  if (n === 4) {
    // Branch B fixture: fuzzy identity, blurry proof, uncertain channel.
    return {
      ...base,
      storedName: "Muhammad Khadija Bano (Demo 004)",
      nameVariants: ["Mohammad Khadija Bano (Demo 004)"],
      ageYears: 38,
      householdSize: 3,
      docStatus: "BLURRY",
      docQuality: 0.7,
      dupSafety: 0.8,
      channelSafety: 0.5,
    };
  }
  return base;
}

/** Prefilled answers used by the "Use demo answers" button (scenario-reproducible). */
export function claimTemplateFor(n: number): ClaimTemplate {
  const rec = recordFor(n);
  const full: ClaimTemplate = {
    claimedName: rec.storedName,
    ageYears: rec.ageYears,
    householdSize: rec.householdSize,
    householdIncomePkr: rec.householdIncomePkr,
    district: rec.district,
    widowAttested: true,
    proofs: [...ALL_PROOFS],
  };
  if (n === 1) return { ...full, claimedName: "Muhammad Rahat Bibi (Demo 001)" };
  if (n === 2) {
    return { ...full, ageYears: 41, householdSize: null, proofs: ["DEMO_ID"] };
  }
  if (n === 4) {
    return {
      ...full,
      claimedName: "Mohammad Khadija Bano (Demo 004)",
      householdSize: null,
      district: null,
      proofs: ["DEMO_ID"],
    };
  }
  return full;
}
