import "server-only";

import { z } from "zod";
import { appendAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transactions";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import { CNIC_LIKE, classifyScam } from "@/lib/ai/guardrails";
import { searchSources } from "@/lib/ai/rag";
import { DocMetricsSchema, inspectDocumentMetrics } from "@/lib/rails/document";
import { isUuid } from "@/lib/auth/consent";
import { newCtx, sha256, userAudit } from "@/lib/services/shared";

const CheckSchema = z
  .object({
    senderLabel: z.string().trim().min(1).max(60),
    messageExcerpt: z.string().trim().min(1).max(280),
  })
  .strict();

const hits = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 12) throw new AppError(403, "RATE_LIMITED");
  recent.push(now);
  hits.set(userId, recent);
}

function assertSignedIn(actor: VerifiedActor) {
  if (!["citizen", "helper", "officer"].includes(actor.role)) throw new AppError(403, "ROLE_FORBIDDEN");
}

export async function checkScam(actor: VerifiedActor, input: unknown) {
  assertSignedIn(actor);
  rateLimit(actor.id);
  const parsed = CheckSchema.safeParse(input);
  if (!parsed.success) throw new AppError(422, "INVALID_INPUT");
  const { senderLabel, messageExcerpt } = parsed.data;
  if (CNIC_LIKE.test(senderLabel) || CNIC_LIKE.test(messageExcerpt)) throw new AppError(422, "CNIC_LIKE_INPUT");

  const ctx = newCtx(actor);
  const result = classifyScam(senderLabel, messageExcerpt);
  const sources = await searchSources("fee 8171 official number fraud scam", { onlyOfficial: true });

  const id = await withTransaction(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.scam_reports (created_by_user_id, sender_label, message_excerpt, verdict, confidence, signals, model_version)
      values (${actor.id}::uuid, ${senderLabel}, ${messageExcerpt}, ${result.verdict}::public.scam_verdict, ${result.confidence},
              ${JSON.stringify(result.signals)}::text::jsonb, 'scam-heuristic-v1')
      returning id`;
    await appendAudit(tx, {
      ...userAudit(ctx), action: "SCAM_CHECKED", entityType: "scam_report", entityId: row.id, outcome: "SUCCESS",
      metadata: { toolResultCode: result.verdict, confidence: result.confidence, modelName: "scam-heuristic-v1", afterHash: sha256(messageExcerpt) },
    });
    await appendAudit(tx, {
      ...userAudit(ctx), action: "POLICY_SEARCHED", entityType: "scam_report", entityId: row.id, outcome: "SUCCESS",
      metadata: { sourceIds: sources.map((s) => s.id), count: sources.length },
    });
    return row.id;
  });
  return { id, ...result, sources };
}

export async function reportFalseAlarm(actor: VerifiedActor, reportId: string, reason: unknown) {
  assertSignedIn(actor);
  if (!isUuid(reportId)) throw new AppError(404, "NOT_FOUND");
  const r = z.string().trim().min(3).max(300).safeParse(reason);
  if (!r.success) throw new AppError(422, "REASON_REQUIRED");
  const ctx = newCtx(actor);
  await withTransaction(async (tx) => {
    const [row] = await tx`select id from public.scam_reports where id = ${reportId}::uuid and created_by_user_id = ${actor.id}::uuid for update`;
    if (!row) throw new AppError(404, "NOT_FOUND");
    await tx`update public.scam_reports set false_alarm_reported = true where id = ${reportId}::uuid`;
    await appendAudit(tx, {
      ...userAudit(ctx), action: "SCAM_FALSE_ALARM_REPORTED", entityType: "scam_report", entityId: reportId,
      outcome: "SUCCESS", metadata: { afterHash: sha256(r.data) },
    });
  });
  return { reported: true as const };
}

export async function scamMetrics() {
  const [m] = await getDb()<{ total: number; false_alarms: number; likely: number }[]>`
    select count(*)::int total, count(*) filter (where false_alarm_reported)::int false_alarms,
           count(*) filter (where verdict = 'LIKELY_SCAM')::int likely from public.scam_reports`;
  return {
    total: m.total,
    falseAlarms: m.false_alarms,
    flaggedLikelyScam: m.likely,
    falseAlarmRate: m.total ? Math.round((m.false_alarms / m.total) * 1000) / 1000 : 0,
  };
}

export async function inspectDocument(actor: VerifiedActor, input: unknown) {
  assertSignedIn(actor);
  rateLimit(actor.id);
  const parsed = DocMetricsSchema.safeParse(input);
  if (!parsed.success) throw new AppError(422, "INVALID_INPUT");
  if (parsed.data.qrPayload && CNIC_LIKE.test(parsed.data.qrPayload)) throw new AppError(422, "CNIC_LIKE_INPUT");
  const ctx = newCtx(actor);
  const result = inspectDocumentMetrics(parsed.data);
  await withTransaction(async (tx) => {
    await appendAudit(tx, {
      ...userAudit(ctx), action: "DOCUMENT_INSPECTED", entityType: "document", entityId: null,
      outcome: result.flags.length ? "UNCERTAIN" : "SUCCESS",
      metadata: { toolName: "inspectDemoDocument", toolResultCode: result.status, confidence: result.confidence, reasonCodes: result.flags },
    });
  });
  return result;
}
