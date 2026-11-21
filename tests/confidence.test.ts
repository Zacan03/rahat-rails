import { describe, expect, it } from "vitest";
import {
  DEMO_FIXTURES,
  NOT_SURE_EN,
  calculateConfidence,
  decide,
  expectedLosses,
} from "@/lib/domain/confidence";

const none = { nameAmbiguity: false, unverifiedSender: false, tamperSuspected: false };

describe("deterministic confidence engine", () => {
  it("reproduces the three SPEC fixtures", () => {
    for (const f of Object.values(DEMO_FIXTURES)) {
      expect(calculateConfidence(f.factors, none).confidence).toBe(f.expected);
    }
  });

  it("routes the fixtures to three different branches", () => {
    expect(decide(0.92, true)).toBe("AUTO_APPROVED");
    expect(decide(0.73, true)).toBe("MORE_PROOF");
    expect(decide(0.44, true)).toBe("OFFICER_REVIEW");
  });

  it("applies exact thresholds", () => {
    expect(decide(0.8499, true)).toBe("MORE_PROOF");
    expect(decide(0.85, true)).toBe("AUTO_APPROVED");
    expect(decide(0.5999, true)).toBe("OFFICER_REVIEW");
    expect(decide(0.6, true)).toBe("MORE_PROOF");
  });

  it("never auto-approves with a failed hard gate, however high the score", () => {
    expect(decide(0.99, false)).toBe("OFFICER_REVIEW");
    expect(decide(1, false)).toBe("OFFICER_REVIEW");
  });

  it("fails closed on invalid numbers", () => {
    expect(decide(NaN, true)).toBe("OFFICER_REVIEW");
    expect(decide(1.2, true)).toBe("OFFICER_REVIEW");
    expect(decide(-0.1, true)).toBe("OFFICER_REVIEW");
    expect(Number.isNaN(calculateConfidence({ ...DEMO_FIXTURES.A.factors, I: 2 }, none).confidence)).toBe(true);
  });

  it("subtracts risk penalties", () => {
    const c = calculateConfidence(
      { I: 1, E: 1, D: 1, U: 1, S: 1, F: 1 },
      { nameAmbiguity: true, unverifiedSender: true, tamperSuspected: true },
    );
    expect(c.confidence).toBe(0.65);
  });

  it("encodes the 20:3 loss ratio (wrong approval <= delay only at C >= 0.85)", () => {
    expect(expectedLosses(0.85).expectedWrongApprovalLoss).toBeCloseTo(3, 4);
    expect(expectedLosses(0.84).expectedWrongApprovalLoss).toBeGreaterThan(3);
    expect(expectedLosses(0.92).expectedManualDelayLoss).toBe(3);
  });

  it("keeps the literal handoff sentence", () => {
    expect(NOT_SURE_EN).toContain("I am not sure");
  });
});
