import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appendAuditStandalone } from "@/lib/db/audit";
import { hasLiveConsent, isUuid } from "@/lib/auth/consent";
import { checkInternalKey, mockError, mockJson } from "@/lib/rails/internal-auth";
import { mockVerifyIdentity } from "@/lib/rails/identity";


const Body = z
  .object({
    caseId: z.string(),
    demoIdentityId: z.string().regex(/^DEMO-[A-Z0-9-]+$/),
    claimedName: z.string().max(120),
    claimedAge: z.number().int().nullable().default(null),
    claimedHouseholdSize: z.number().int().nullable().default(null),
  })
  .strict();

/** MOCK NADRA identity verify. Synthetic only; requires internal key AND live consent. */
export async function POST(request: Request) {
  const gate = checkInternalKey(request);
  if (gate !== "ok") return mockError(gate === "unavailable" ? 503 : 401, gate.toUpperCase());

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.caseId)) return mockError(422, "INVALID_INPUT");
  const b = parsed.data;

  const db = getDb();
  const [row] = await db<{ citizen_profile_id: string; demo_identity_id: string }[]>`
    select c.citizen_profile_id, p.demo_identity_id from public.cases c
    join public.citizen_profiles p on p.id = c.citizen_profile_id where c.id = ${b.caseId}::uuid`;
  const correlationId = randomUUID();
  if (!row || row.demo_identity_id !== b.demoIdentityId) return mockError(404, "NOT_FOUND");
  if (!(await hasLiveConsent(db, row.citizen_profile_id, null, "identity:verify"))) {
    await appendAuditStandalone({
      correlationId, actorType: "system", actorUserId: null, actorLabel: "mock-nadra-v1",
      action: "ACCESS_DENIED", entityType: "case", entityId: b.caseId, outcome: "DENIED",
      metadata: { toolName: "lookupDemoIdentity", reasonCode: "CONSENT_REQUIRED" },
    });
    return mockError(403, "CONSENT_REQUIRED");
  }
  const result = mockVerifyIdentity({
    demoIdentityId: b.demoIdentityId,
    claimedName: b.claimedName,
    claimedAge: b.claimedAge,
    claimedHouseholdSize: b.claimedHouseholdSize,
  });
  await appendAuditStandalone({
    correlationId, actorType: "system", actorUserId: null, actorLabel: "mock-nadra-v1",
    action: "IDENTITY_TOOL_CALLED", entityType: "case", entityId: b.caseId, outcome: "SUCCESS",
    metadata: { toolName: "lookupDemoIdentity", toolResultCode: result.matchStatus },
  });
  return mockJson({ matchStatus: result.matchStatus, confidence: result.factor, candidateIds: result.candidateIds, simulated: true });
}
