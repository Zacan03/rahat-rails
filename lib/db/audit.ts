import "server-only";

import type { Sql, TransactionSql } from "postgres";
import { getDb } from "@/lib/db/client";

export type AuditOutcome = "SUCCESS" | "DENIED" | "ERROR" | "UNCERTAIN";

export type AuditEvent = {
  correlationId: string;
  actorType: "user" | "ai" | "agent" | "system" | "api";
  actorUserId: string | null;
  actorLabel: string; // role or version — never a person's name
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
};

const ALLOWED_METADATA_KEYS = new Set([
  "policyRuleId", "ruleVersion", "decision", "confidence", "factorScores", "hardGates",
  "modelName", "promptVersion", "toolName", "toolResultCode", "sourceIds", "latencyMs",
  "beforeHash", "afterHash", "fromStatus", "toStatus", "reasonCode", "reasonCodes",
  "scopes", "grantee", "mode", "matchStatus", "expectedWrongApprovalLoss",
  "expectedManualDelayLoss", "paymentRefHash", "idempotent", "role", "count", "queueSize",
]);

/** Strict allowlist: unknown keys are dropped so raw text can never reach the audit log. */
export function sanitizeMetadata(meta: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (ALLOWED_METADATA_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/** Must be called with the SAME transaction handle as the business mutation. */
export async function appendAudit(tx: TransactionSql | Sql, e: AuditEvent) {
  const meta = sanitizeMetadata(e.metadata);
  await tx`
    select private.append_audit(
      ${e.correlationId}::uuid, ${e.actorType}, ${e.actorUserId}::uuid, ${e.actorLabel},
      ${e.action}, ${e.entityType}, ${e.entityId}::uuid, ${e.outcome},
      ${JSON.stringify(meta)}::text::jsonb
    )`;
}

/** Standalone append for denials/reads (own implicit transaction). */
export async function appendAuditStandalone(e: AuditEvent) {
  await appendAudit(getDb(), e);
}

export type ChainVerification = { ok: boolean; checked: number; brokenAtId: number | null };

export async function verifyAuditChain(): Promise<ChainVerification> {
  const rows = await getDb()`
    select id, event_id, occurred_at, correlation_id, actor_type, actor_user_id, actor_label,
           action, entity_type, entity_id, outcome, metadata, previous_hash, entry_hash,
           encode(sha256(convert_to(concat_ws('|', previous_hash, event_id::text, occurred_at::text,
             correlation_id::text, actor_type, coalesce(actor_user_id::text,''), actor_label, action,
             entity_type, coalesce(entity_id::text,''), outcome, metadata::text), 'UTF8')), 'hex') as recomputed
    from public.audit_logs order by id asc`;
  let prev = "0".repeat(64);
  for (const r of rows) {
    if (r.previous_hash !== prev || r.recomputed !== r.entry_hash) {
      return { ok: false, checked: rows.length, brokenAtId: Number(r.id) };
    }
    prev = r.entry_hash;
  }
  return { ok: true, checked: rows.length, brokenAtId: null };
}
