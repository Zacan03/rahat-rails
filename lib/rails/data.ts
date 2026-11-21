import { indexOfDemoId, recordFor, type MockRecord } from "@/lib/rails/fixtures";

export type DataResult =
  | { available: true; record: MockRecord; simulated: true }
  | { available: false; simulated: true };

/** MOCK demographic/document/duplicate/channel rail. Synthetic data only. */
export function mockLookupData(demoIdentityId: string): DataResult {
  const n = indexOfDemoId(demoIdentityId);
  if (n === null) return { available: false, simulated: true };
  return { available: true, record: recordFor(n), simulated: true };
}
