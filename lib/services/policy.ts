import "server-only";

import type { TransactionSql } from "postgres";
import { appendAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transactions";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import { PolicyRuleSchema } from "@/lib/domain/rules";
import { isUuid } from "@/lib/auth/consent";
import { newCtx, sha256, userAudit } from "@/lib/services/shared";
import { POLICY_KEY } from "@/lib/services/claims";

function requireAdmin(actor: VerifiedActor) {
  if (actor.role !== "admin") throw new AppError(403, "ROLE_FORBIDDEN");
}

export type PolicyListRow = {
  id: string; version: number; status: "draft" | "active" | "retired"; title: string;
  rules: Record<string, unknown>; publishedAt: Date | null; casesPinned: number;
};

export async function listPolicies(actor: VerifiedActor): Promise<PolicyListRow[]> {
  requireAdmin(actor);
  const rows = await getDb()<{ id: string; version: number; status: PolicyListRow["status"]; title: string; rules_json: Record<string, unknown>; published_at: Date | null; pinned: number }[]>`
    select p.id, p.version, p.status, p.title, p.rules_json, p.published_at,
           (select count(*)::int from public.cases c where c.policy_rule_id = p.id) as pinned
    from public.policy_rules p where p.policy_key = ${POLICY_KEY} order by p.version desc`;
  return rows.map((r) => ({ id: r.id, version: r.version, status: r.status, title: r.title, rules: r.rules_json, publishedAt: r.published_at, casesPinned: r.pinned }));
}

/** Creates version max+1 as a DRAFT. Sources are copied from the active version. */
export async function createDraft(actor: VerifiedActor, rulesInput: unknown) {
  requireAdmin(actor);
  const parsed = PolicyRuleSchema.safeParse(rulesInput);
  if (!parsed.success) throw new AppError(422, "INVALID_RULES");
  const ctx = newCtx(actor);
  return withTransaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${POLICY_KEY}))`;
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version),0)+1 as next from public.policy_rules where policy_key = ${POLICY_KEY}`;
    const [row] = await tx<{ id: string }[]>`
      insert into public.policy_rules (policy_key, version, status, title, rules_json, sources_json, created_by_user_id)
      select ${POLICY_KEY}, ${next}, 'draft', ${`Synthetic relief rule v${next} (draft)`}, ${JSON.stringify(parsed.data)}::text::jsonb,
             coalesce((select sources_json from public.policy_rules where policy_key = ${POLICY_KEY} and status = 'active'), '[]'::jsonb),
             ${actor.id}::uuid
      returning id`;
    await appendAudit(tx, {
      ...userAudit(ctx), action: "POLICY_DRAFT_CREATED", entityType: "policy_rule", entityId: row.id, outcome: "SUCCESS",
      metadata: { ruleVersion: next, afterHash: sha256(parsed.data) },
    });
    return { id: row.id, version: next };
  });
}

/** Drafts are mutable; published versions are protected by a DB trigger. */
export async function updateDraft(actor: VerifiedActor, id: string, rulesInput: unknown) {
  requireAdmin(actor);
  if (!isUuid(id)) throw new AppError(404, "NOT_FOUND");
  const parsed = PolicyRuleSchema.safeParse(rulesInput);
  if (!parsed.success) throw new AppError(422, "INVALID_RULES");
  const ctx = newCtx(actor);
  await withTransaction(async (tx) => {
    const [row] = await tx<{ version: number; status: string; rules_json: unknown }[]>`select version, status, rules_json from public.policy_rules where id = ${id}::uuid for update`;
    if (!row) throw new AppError(404, "NOT_FOUND");
    if (row.status !== "draft") throw new AppError(409, "POLICY_IMMUTABLE");
    await tx`update public.policy_rules set rules_json = ${JSON.stringify(parsed.data)}::text::jsonb where id = ${id}::uuid`;
    await appendAudit(tx, {
      ...userAudit(ctx), action: "POLICY_DRAFT_CREATED", entityType: "policy_rule", entityId: id, outcome: "SUCCESS",
      metadata: { ruleVersion: row.version, beforeHash: sha256(row.rules_json), afterHash: sha256(parsed.data) },
    });
  });
}

/** One transaction: retire current active, activate draft, audit. Existing cases stay pinned. */
export async function publishPolicy(actor: VerifiedActor, id: string) {
  return withTransaction((tx) => publishInTx(tx, actor, id));
}

/** Exposed so tests can run the real publish logic inside a transaction they roll back. */
export async function publishInTx(tx: TransactionSql, actor: VerifiedActor, id: string) {
  requireAdmin(actor);
  if (!isUuid(id)) throw new AppError(404, "NOT_FOUND");
  const ctx = newCtx(actor);
  {
    await tx`select pg_advisory_xact_lock(hashtext(${POLICY_KEY}))`;
    const [draft] = await tx<{ id: string; version: number; status: string; rules_json: unknown }[]>`
      select id, version, status, rules_json from public.policy_rules where id = ${id}::uuid and policy_key = ${POLICY_KEY} for update`;
    if (!draft) throw new AppError(404, "NOT_FOUND");
    if (draft.status !== "draft") throw new AppError(409, "NOT_A_DRAFT");
    if (!PolicyRuleSchema.safeParse(draft.rules_json).success) throw new AppError(422, "INVALID_RULES");
    const [active] = await tx<{ id: string; version: number; rules_json: unknown }[]>`
      select id, version, rules_json from public.policy_rules where policy_key = ${POLICY_KEY} and status = 'active' for update`;
    if (active && draft.version <= active.version) throw new AppError(409, "VERSION_NOT_NEWER");
    if (active) await tx`update public.policy_rules set status = 'retired' where id = ${active.id}::uuid`;
    await tx`update public.policy_rules set status = 'active', published_at = now(), published_by_user_id = ${actor.id}::uuid
             where id = ${draft.id}::uuid`;
    await appendAudit(tx, {
      ...userAudit(ctx), action: "POLICY_PUBLISHED", entityType: "policy_rule", entityId: draft.id, outcome: "SUCCESS",
      metadata: {
        policyRuleId: draft.id, ruleVersion: draft.version,
        beforeHash: active ? sha256(active.rules_json) : undefined, afterHash: sha256(draft.rules_json),
      },
    });
    return { id: draft.id, version: draft.version, retiredVersion: active?.version ?? null };
  }
}
