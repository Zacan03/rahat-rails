import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { appendAudit, appendAuditStandalone } from "@/lib/db/audit";
import { assertTransition, type CaseStatus } from "@/lib/domain/case-machine";
import { priorityFor } from "@/lib/domain/rules";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";

export type Ctx = { actor: VerifiedActor; correlationId: string };

export const newCtx = (actor: VerifiedActor): Ctx => ({ actor, correlationId: randomUUID() });

export const sha256 = (v: unknown) =>
  createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

export type CaseRow = {
  id: string;
  citizen_profile_id: string;
  created_by_user_id: string;
  helper_user_id: string | null;
  assigned_officer_user_id: string | null;
  policy_rule_id: string | null;
  status: CaseStatus;
  priority: number;
  confidence: string | null;
  mock_payment_ref: string | null;
  payment_status: string;
  claim_answers: Record<string, unknown>;
  created_at: Date;
};

export function userAudit(ctx: Ctx) {
  return {
    correlationId: ctx.correlationId,
    actorType: "user" as const,
    actorUserId: ctx.actor.id,
    actorLabel: ctx.actor.role,
  };
}

/** Single place that moves a case: state machine check + update + audit, same tx. */
export async function moveStatus(
  tx: TransactionSql,
  ctx: Ctx,
  row: Pick<CaseRow, "id" | "status">,
  to: CaseStatus,
  action: string,
  meta: Record<string, unknown> = {},
  householdSize: number | null = null,
) {
  assertTransition(row.status, to);
  const priority = priorityFor({ householdSize, status: to, ageHours: 0 });
  await tx`update public.cases set status = ${to}::public.case_status, priority = ${priority},
           updated_at = now() where id = ${row.id}::uuid`;
  await appendAudit(tx, {
    ...userAudit(ctx),
    action,
    entityType: "case",
    entityId: row.id,
    outcome: "SUCCESS",
    metadata: { fromStatus: row.status, toStatus: to, ...meta },
  });
  row.status = to;
}

/** Denials are logged in their own transaction after the failed one rolled back. */
export async function auditDenied(ctx: Ctx, action: string, entityType: string, entityId: string | null, reasonCode: string) {
  try {
    await appendAuditStandalone({
      ...userAudit(ctx),
      action: "ACCESS_DENIED",
      entityType,
      entityId,
      outcome: "DENIED",
      metadata: { reasonCode: `${action}:${reasonCode}` },
    });
  } catch {
    // never mask the original failure
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return new AppError(503, "SERVICE_ERROR");
}
