import "server-only";

import { appendAuditStandalone, verifyAuditChain, type ChainVerification } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import { newCtx, userAudit } from "@/lib/services/shared";

export type AuditRow = {
  id: number; occurredAt: Date; action: string; outcome: string; actorType: string; actorLabel: string;
  entityType: string; entityId: string | null; correlationId: string; metadata: Record<string, unknown>;
  entryHash: string; previousHash: string;
};

export type TraceCase = {
  id: string; status: string; confidence: number | null; policyVersion: number | null;
  reasonEn: string | null; reasonUr: string | null; explanation: Record<string, unknown>;
  factorScores: Record<string, number>; hardGates: Record<string, boolean>;
  overridden: boolean;
};

/**
 * Auditor view: stored audit metadata is already allowlist-redacted (no names, SMS text,
 * payment refs, tokens). Case trace shows scores/rules/tools only, never profile fields.
 */
export async function loadAuditorView(actor: VerifiedActor, caseId: string | null) {
  if (actor.role !== "auditor") throw new AppError(403, "ROLE_FORBIDDEN");
  const db = getDb();
  const chain: ChainVerification = await verifyAuditChain();
  const rows = caseId
    ? await db<Record<string, unknown>[]>`select * from public.audit_logs where entity_id = ${caseId}::uuid order by id asc limit 300`
    : await db<Record<string, unknown>[]>`select * from public.audit_logs order by id desc limit 100`;
  const events: AuditRow[] = rows.map((r) => ({
    id: Number(r.id), occurredAt: r.occurred_at as Date, action: r.action as string, outcome: r.outcome as string,
    actorType: r.actor_type as string, actorLabel: r.actor_label as string, entityType: r.entity_type as string,
    entityId: (r.entity_id as string | null) ?? null, correlationId: r.correlation_id as string,
    metadata: r.metadata as Record<string, unknown>, entryHash: r.entry_hash as string, previousHash: r.previous_hash as string,
  }));

  const cases = await db<{ id: string; status: string; confidence: string | null; version: number | null; user_reason_en: string | null; user_reason_ur: string | null; auditor_explanation: Record<string, unknown>; factor_scores: Record<string, number>; hard_gates: Record<string, boolean>; officer_notes: string | null }[]>`
    select c.id, c.status, c.confidence, pr.version, c.user_reason_en, c.user_reason_ur, c.auditor_explanation,
           c.factor_scores, c.hard_gates, c.officer_notes
    from public.cases c left join public.policy_rules pr on pr.id = c.policy_rule_id
    ${caseId ? db`where c.id = ${caseId}::uuid` : db``}
    order by c.created_at desc limit 25`;
  const traces: TraceCase[] = cases.map((c) => ({
    id: c.id, status: c.status, confidence: c.confidence === null ? null : Number(c.confidence), policyVersion: c.version,
    reasonEn: c.user_reason_en, reasonUr: c.user_reason_ur, explanation: c.auditor_explanation,
    factorScores: c.factor_scores, hardGates: c.hard_gates, overridden: c.officer_notes !== null,
  }));

  await appendAuditStandalone({
    ...userAudit(newCtx(actor)), action: "AUDIT_VIEWED", entityType: "audit_log", entityId: caseId, outcome: "SUCCESS",
    metadata: { count: events.length },
  });
  return { chain, events, traces };
}
