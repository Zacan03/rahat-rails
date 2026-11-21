import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appendAuditStandalone } from "@/lib/db/audit";
import { hasLiveConsent, isUuid } from "@/lib/auth/consent";
import { checkInternalKey, mockError, mockJson } from "@/lib/rails/internal-auth";
import { mockDisburse } from "@/lib/rails/payment";


const Body = z.object({ caseId: z.string(), idempotencyKey: z.string().uuid() }).strict();

/**
 * MOCK Raast disburse. Read-only preview of the deterministic reference: the case row is
 * only ever updated by the audited service transaction. Requires an already-approved case
 * AND live payment consent. No real money moves.
 */
export async function POST(request: Request) {
  const gate = checkInternalKey(request);
  if (gate !== "ok") return mockError(gate === "unavailable" ? 503 : 401, gate.toUpperCase());

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.caseId)) return mockError(422, "INVALID_INPUT");

  const db = getDb();
  const [row] = await db<{ citizen_profile_id: string; status: string; idempotency_key: string; amount: number | null }[]>`
    select c.citizen_profile_id, c.status, c.idempotency_key, (pr.rules_json->>'grant_amount_pkr')::int as amount
    from public.cases c left join public.policy_rules pr on pr.id = c.policy_rule_id
    where c.id = ${parsed.data.caseId}::uuid`;
  if (!row || row.idempotency_key !== parsed.data.idempotencyKey) return mockError(404, "NOT_FOUND");
  const correlationId = randomUUID();
  const audit = (action: string, outcome: "SUCCESS" | "DENIED", reasonCode?: string) =>
    appendAuditStandalone({
      correlationId, actorType: "system", actorUserId: null, actorLabel: "mock-raast-v1",
      action, entityType: "case", entityId: parsed.data.caseId, outcome,
      metadata: { toolName: "simulateDemoPayment", ...(reasonCode ? { reasonCode } : {}) },
    });

  if (!["AUTO_APPROVED", "OFFICER_APPROVED", "MOCK_PAID"].includes(row.status)) {
    await audit("ACCESS_DENIED", "DENIED", "NOT_APPROVED");
    return mockError(409, "PAYMENT_NOT_APPROVED");
  }
  if (!(await hasLiveConsent(db, row.citizen_profile_id, null, "payment:simulate"))) {
    await audit("ACCESS_DENIED", "DENIED", "CONSENT_REQUIRED");
    return mockError(403, "CONSENT_REQUIRED");
  }
  const pay = mockDisburse({ caseId: parsed.data.caseId, amountPkr: row.amount ?? 0 });
  await audit("MOCK_PAYMENT_ATTEMPTED", "SUCCESS");
  return mockJson({ reference: pay.reference, simulated: true, notice: pay.notice });
}
