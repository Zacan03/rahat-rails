import { createHash } from "node:crypto";

export type DisburseResult = {
  reference: string;
  simulated: true;
  amountPkr: number;
  notice: "SIMULATED — NO REAL MONEY MOVED";
};

/**
 * MOCK Raast rail. The reference is a pure function of the case id, so retries and
 * refreshes always return the same reference and no second payment can exist.
 */
export function mockDisburse(args: { caseId: string; amountPkr: number }): DisburseResult {
  const digest = createHash("sha256").update(`MOCK-RAAST|${args.caseId}`).digest("hex");
  return {
    reference: `MOCK-RAAST-${digest.slice(0, 12).toUpperCase()}`,
    simulated: true,
    amountPkr: args.amountPkr,
    notice: "SIMULATED — NO REAL MONEY MOVED",
  };
}
