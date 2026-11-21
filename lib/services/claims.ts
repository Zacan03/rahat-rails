import "server-only";

import type { TransactionSql } from "postgres";
import { z } from "zod";
import { appendAudit } from "@/lib/db/audit";
import { withTransaction } from "@/lib/db/transactions";
import {
  hasLiveConsent,
  lockProfile,
  requireLivePlatformConsent,
  requireProfileAccess,
} from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import {
  NOT_SURE_EN,
  NOT_SURE_UR,
  calculateConfidence,
  decide,
  expectedLosses,
  type Factors,
} from "@/lib/domain/confidence";
import { PolicyRuleSchema, eligibilityScore, evaluatePredicates, priorityFor, type PolicyRule } from "@/lib/domain/rules";
import { mockVerifyIdentity } from "@/lib/rails/identity";
import { mockLookupData } from "@/lib/rails/data";
import { mockDisburse } from "@/lib/rails/payment";
import {
  moveStatus,
  newCtx,
  sha256,
  userAudit,
  type CaseRow,
  type Ctx,
} from "@/lib/services/shared";

export const POLICY_KEY = "RELIEF_GRANT_DEMO";

const CNIC_LIKE = /\d{5}-?\d{7}-?\d/;
const safeText = z
  .string()
  .max(120)
  .refine((s) => !CNIC_LIKE.test(s), { message: "CNIC_LIKE_INPUT" });

export const ClaimAnswersSchema = z
  .object({
    claimedName: safeText.nullable(),
    ageYears: z.number().int().min(18).max(110).nullable(),
    householdSize: z.number().int().min(1).max(40).nullable(),
    householdIncomePkr: z.number().int().min(0).max(10_000_000).nullable(),
    district: z.string().regex(/^[A-Z_]{3,40}$/).nullable(),
    widowAttested: z.boolean(),
    proofs: z.array(z.string().regex(/^[A-Z_]{3,40}$/)).max(10),
  })
  .strict();
export type ClaimAnswers = z.infer<typeof ClaimAnswersSchema>;

export const EMPTY_ANSWERS: ClaimAnswers = {
  claimedName: null,
  ageYears: null,
  householdSize: null,
  householdIncomePkr: null,
  district: null,
  widowAttested: false,
  proofs: [],
};

export function parseAnswers(input: unknown): ClaimAnswers {
  const r = ClaimAnswersSchema.safeParse(input);
  if (!r.success) {
    const cnic = r.error.issues.some((i) => i.message === "CNIC_LIKE_INPUT");
    throw new AppError(422, cnic ? "CNIC_LIKE_INPUT" : "INVALID_ANSWERS");
  }
  return r.data;
}

/** Idempotent: one open case per family. Re-calling returns the same case. */
export async function getOrCreateDraft(actor: VerifiedActor, profileId: string) {
  const ctx = newCtx(actor);
  if (actor.role !== "citizen" && actor.role !== "helper") throw new AppError(403, "ROLE_FORBIDDEN");
  return withTransaction(async (tx) => {
    await lockProfile(tx, profileId);
    await requireProfileAccess(tx, actor, profileId, "case:write");
    await requireLivePlatformConsent(tx, profileId, "platform:process");

    const [existing] = await tx<{ id: string }[]>`
      select id from public.cases
      where citizen_profile_id = ${profileId}::uuid and status not in ('CLOSED','CONSENT_WITHDRAWN')
      order by created_at desc limit 1`;
    if (existing) return existing.id;

    const [created] = await tx<{ id: string }[]>`
      insert into public.cases (citizen_profile_id, created_by_user_id, helper_user_id, claim_answers)
      values (${profileId}::uuid, ${actor.id}::uuid, ${actor.role === "helper" ? actor.id : null}::uuid,
              ${JSON.stringify(EMPTY_ANSWERS)}::text::jsonb)
      returning id`;
    await appendAudit(tx, {
      ...userAudit(ctx),
      action: "CASE_CREATED",
      entityType: "case",
      entityId: created.id,
      outcome: "SUCCESS",
      metadata: { toStatus: "DRAFT" },
    });
    return created.id;
  });
}

async function lockCase(tx: TransactionSql, caseId: string): Promise<CaseRow> {
  const [row] = await tx<CaseRow[]>`select * from public.cases where id = ${caseId}::uuid for update`;
  if (!row) throw new AppError(404, "NOT_FOUND");
  return row;
}

/** Common preamble for citizen/helper writes: row lock + object access + live consent. */
async function authorizeClaimWrite(tx: TransactionSql, actor: VerifiedActor, caseId: string) {
  if (actor.role !== "citizen" && actor.role !== "helper") throw new AppError(403, "ROLE_FORBIDDEN");
  const [probe] = await tx<{ citizen_profile_id: string }[]>`
    select citizen_profile_id from public.cases where id = ${caseId}::uuid`;
  if (!probe) throw new AppError(404, "NOT_FOUND");
  await lockProfile(tx, probe.citizen_profile_id);
  const profile = await requireProfileAccess(tx, actor, probe.citizen_profile_id, "case:write");
  await requireLivePlatformConsent(tx, profile.id, "platform:process");
  const row = await lockCase(tx, caseId);
  return { row, profile };
}

export async function saveDraft(actor: VerifiedActor, caseId: string, answersInput: unknown) {
  const ctx = newCtx(actor);
  const answers = parseAnswers(answersInput);
  return withTransaction(async (tx) => {
    const { row } = await authorizeClaimWrite(tx, actor, caseId);
    if (row.status !== "DRAFT" && row.status !== "MORE_PROOF") throw new AppError(409, "NOT_EDITABLE");
    await tx`update public.cases set claim_answers = ${JSON.stringify(answers)}::text::jsonb, updated_at = now()
             where id = ${caseId}::uuid`;
    await appendAudit(tx, {
      ...userAudit(ctx),
      action: "CASE_SAVED",
      entityType: "case",
      entityId: caseId,
      outcome: "SUCCESS",
      metadata: { beforeHash: sha256(row.claim_answers), afterHash: sha256(answers) },
    });
    return { saved: true as const };
  });
}

type PolicyRow = { id: string; version: number; rules_json: unknown };

async function loadPinnedRule(tx: TransactionSql, row: CaseRow): Promise<{ id: string; version: number; rule: PolicyRule }> {
  const [p] = row.policy_rule_id
    ? await tx<PolicyRow[]>`select id, version, rules_json from public.policy_rules where id = ${row.policy_rule_id}::uuid`
    : await tx<PolicyRow[]>`select id, version, rules_json from public.policy_rules
                           where policy_key = ${POLICY_KEY} and status = 'active'`;
  if (!p) throw new AppError(503, "POLICY_UNAVAILABLE");
  const parsed = PolicyRuleSchema.safeParse(p.rules_json);
  if (!parsed.success) throw new AppError(503, "POLICY_INVALID");
  return { id: p.id, version: p.version, rule: parsed.data };
}

const REQUIRED_FIELDS = ["claimedName", "ageYears", "householdSize", "householdIncomePkr", "district"] as const;

/** Submit → pin rule → mock checks → deterministic score → decision → (payment) in ONE transaction. */
export async function submitCase(actor: VerifiedActor, caseId: string, answersInput: unknown) {
  const ctx = newCtx(actor);
  const answers = parseAnswers(answersInput);

  return withTransaction(async (tx) => {
    const { row, profile } = await authorizeClaimWrite(tx, actor, caseId);

    // Idempotent replay: a submitted case is returned as-is, never re-evaluated or re-paid.
    if (row.status !== "DRAFT" && row.status !== "MORE_PROOF") {
      return { status: row.status, replay: true as const };
    }

    const pinned = await loadPinnedRule(tx, row);
    await tx`update public.cases set claim_answers = ${JSON.stringify(answers)}::text::jsonb,
             policy_rule_id = ${pinned.id}::uuid, submitted_at = coalesce(submitted_at, now())
             where id = ${caseId}::uuid`;
    await moveStatus(tx, ctx, row, "SUBMITTED", "CASE_SUBMITTED", {
      policyRuleId: pinned.id,
      ruleVersion: pinned.version,
    });
    await moveStatus(tx, ctx, row, "CHECKING", "CASE_CHECKING");

    return evaluateInTx(tx, ctx, row, profile, pinned, answers);
  });
}

type Pinned = { id: string; version: number; rule: PolicyRule };

async function evaluateInTx(
  tx: TransactionSql,
  ctx: Ctx,
  row: CaseRow,
  profile: { id: string; demo_identity_id: string },
  pinned: Pinned,
  answers: ClaimAnswers,
) {
  const demoId = profile.demo_identity_id;
  const sysAudit = {
    correlationId: ctx.correlationId,
    actorType: "agent" as const,
    actorUserId: null,
    actorLabel: "mock-rails-v1",
    entityType: "case",
    entityId: row.id,
  };

  // --- mock tool calls (in-process deterministic adapters; each audited) ---
  const identity = mockVerifyIdentity({
    demoIdentityId: demoId,
    claimedName: answers.claimedName,
    claimedAge: answers.ageYears,
    claimedHouseholdSize: answers.householdSize,
  });
  await appendAudit(tx, {
    ...sysAudit, action: "IDENTITY_TOOL_CALLED", outcome: identity.matchStatus === "UNAVAILABLE" ? "ERROR" : "SUCCESS",
    metadata: { toolName: "lookupDemoIdentity", toolResultCode: identity.matchStatus, matchStatus: identity.matchStatus },
  });

  const data = mockLookupData(demoId);
  await appendAudit(tx, {
    ...sysAudit, action: "DATA_TOOL_CALLED", outcome: data.available ? "SUCCESS" : "ERROR",
    metadata: { toolName: "checkDemoDuplicate", toolResultCode: data.available ? "OK" : "UNAVAILABLE" },
  });

  const [{ paid }] = await tx<{ paid: number }[]>`
    select count(*)::int as paid from public.cases
    where citizen_profile_id = ${profile.id}::uuid and mock_payment_ref is not null and id <> ${row.id}::uuid`;
  const [{ scam }] = await tx<{ scam: number }[]>`
    select count(*)::int as scam from public.scam_reports
    where case_id = ${row.id}::uuid and verdict = 'LIKELY_SCAM' and human_override is null`;

  const mocksHealthy = data.available && identity.matchStatus !== "UNAVAILABLE";
  const rec = data.available ? data.record : null;
  const priorGrants = (rec?.priorMockGrants ?? 0) + paid;

  // --- factors ---
  const preds = evaluatePredicates(pinned.rule, {
    ageYears: rec?.ageYears ?? null,
    isWidow: rec ? (answers.widowAttested ? rec.isWidow : false) : null,
    householdIncomePkr: rec?.householdIncomePkr ?? null,
    district: rec?.district ?? null,
    priorMockGrants: priorGrants,
    proofsProvided: answers.proofs,
  });
  const filled = REQUIRED_FIELDS.filter((k) => answers[k] !== null && answers[k] !== "").length;
  const factors: Factors = {
    I: identity.factor,
    E: eligibilityScore(preds),
    D: rec ? rec.docQuality : 0,
    U: rec ? (priorGrants > pinned.rule.max_prior_mock_grants ? 0 : rec.dupSafety) : 0,
    S: rec ? rec.channelSafety : 0,
    F: filled / REQUIRED_FIELDS.length,
  };
  const flags = {
    nameAmbiguity: identity.nameAmbiguity,
    unverifiedSender: rec?.unverifiedSender ?? false,
    tamperSuspected: rec?.docStatus === "TAMPER_SUSPECTED",
  };
  const { confidence, base, penalty } = calculateConfidence(factors, flags);

  // --- hard gates (missing => false) ---
  const consentScopes = ["platform:process", "identity:verify", "ai:process", "payment:simulate"];
  const consentChecks = await Promise.all(consentScopes.map((s) => hasLiveConsent(tx, profile.id, null, s)));
  const hardGates: Record<string, boolean> = {
    consentLive: consentChecks.every(Boolean),
    identityMatch: identity.matchStatus === "MATCH",
    noDuplicateOrTamper: !!rec && rec.dupStatus === "NONE" && rec.docStatus !== "TAMPER_SUSPECTED",
    policyPredicatesAllTrue: preds.every((p) => p.result === true),
    evidenceQualityPass: rec?.docStatus === "PASS",
    noUnresolvedScamReport: scam === 0,
    caseStateValid: row.status === "CHECKING",
    noPriorPayment: !row.mock_payment_ref && priorGrants <= pinned.rule.max_prior_mock_grants,
    rulePinned: true,
    mockApisHealthy: mocksHealthy,
    noAiValidationFailure: true,
  };
  const gatesPass = Object.values(hardGates).every(Boolean);
  const decision = decide(confidence, gatesPass);
  const losses = Number.isFinite(confidence) ? expectedLosses(confidence) : null;

  // --- reasons / requested proof ---
  const failedGates = Object.entries(hardGates).filter(([, v]) => !v).map(([k]) => k);
  const requested: { code: string; text: string }[] = [];
  if (decision === "MORE_PROOF") {
    for (const p of pinned.rule.required_proofs) {
      if (!answers.proofs.includes(p)) requested.push({ code: p, text: `Provide proof: ${p}` });
    }
    if (rec?.docStatus === "BLURRY") requested.push({ code: "CLEARER_DOCUMENT", text: "Upload a clearer demo document image" });
    REQUIRED_FIELDS.forEach((k) => {
      if (answers[k] === null || answers[k] === "") requested.push({ code: `FIELD_${k.toUpperCase()}`, text: `Complete the missing answer: ${k}` });
    });
    if (identity.matchStatus === "FUZZY") requested.push({ code: "CONFIRM_HOUSEHOLD", text: "Confirm household details to corroborate identity" });
    if (requested.length === 0) requested.push({ code: "ANY_ADDITIONAL_PROOF", text: "Provide one more supporting demo document" });
  }
  const reasons = reasonText(decision);
  const priority = priorityFor({
    householdSize: answers.householdSize,
    status: decision === "OFFICER_REVIEW" ? "OFFICER_REVIEW" : decision === "MORE_PROOF" ? "MORE_PROOF" : "AUTO",
    ageHours: 0,
  });

  let officerId: string | null = null;
  if (decision === "OFFICER_REVIEW") {
    const [o] = await tx<{ id: string }[]>`
      select u.id from public.users u where u.role = 'officer' and u.active
      order by (select count(*) from public.cases c where c.assigned_officer_user_id = u.id
                and c.status in ('OFFICER_REVIEW','ESCALATED')) asc, u.id limit 1`;
    officerId = o?.id ?? null;
  }

  const auditorExplanation = {
    factorScores: factors,
    penalties: { ...flags, total: penalty, base },
    hardGates,
    failedGates,
    predicates: preds,
    policyRuleId: pinned.id,
    policyVersion: pinned.version,
    sourceIds: [`SIM-RULE-V${pinned.version}`],
    modelVersion: "deterministic-engine-v1 (no LLM used)",
    toolEvents: [
      { tool: "lookupDemoIdentity", result: identity.matchStatus },
      { tool: "checkDemoDuplicate", result: rec?.dupStatus ?? "UNAVAILABLE" },
    ],
    reasonCodes: failedGates,
    decisionActor: "system:deterministic-engine",
    reviewOverride: null,
    expectedLosses: losses,
    generatedAt: new Date().toISOString(),
  };

  await tx`
    update public.cases set
      confidence = ${Number.isFinite(confidence) ? confidence : null},
      factor_scores = ${JSON.stringify(factors)}::text::jsonb,
      hard_gates = ${JSON.stringify(hardGates)}::text::jsonb,
      risk_flags = ${JSON.stringify(Object.entries(flags).filter(([, v]) => v).map(([k]) => k))}::text::jsonb,
      identity_match_status = ${identity.matchStatus},
      document_status = ${rec?.docStatus ?? "MISSING"},
      user_reason_en = ${reasons.en}, user_reason_ur = ${reasons.ur},
      auditor_explanation = ${JSON.stringify(auditorExplanation)}::text::jsonb,
      requested_proof = ${JSON.stringify(requested)}::text::jsonb,
      assigned_officer_user_id = ${officerId}::uuid,
      priority = ${priority}, decided_at = now(), updated_at = now()
    where id = ${row.id}::uuid`;

  await moveStatus(tx, ctx, row, decision, "CASE_EVALUATED", {
    decision,
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    factorScores: factors,
    hardGates,
    policyRuleId: pinned.id,
    ruleVersion: pinned.version,
    modelName: "deterministic-engine-v1",
    ...(losses ?? {}),
  }, answers.householdSize);
  // moveStatus recomputed priority without the decided status extras; restore the computed one.
  await tx`update public.cases set priority = ${priority} where id = ${row.id}::uuid`;

  if (decision === "MORE_PROOF") {
    await appendAudit(tx, {
      ...userAudit(ctx), action: "MORE_PROOF_REQUESTED", entityType: "case", entityId: row.id,
      outcome: "SUCCESS", metadata: { count: requested.length, reasonCodes: requested.map((r) => r.code) },
    });
  }
  if (decision === "OFFICER_REVIEW") {
    await appendAudit(tx, {
      ...userAudit(ctx), action: "CASE_ESCALATED", entityType: "case", entityId: row.id,
      outcome: "UNCERTAIN", metadata: { reasonCodes: failedGates, role: officerId ? "officer" : "unassigned" },
    });
  }

  let paymentRef: string | null = null;
  if (decision === "AUTO_APPROVED") {
    paymentRef = await finalizePayment(tx, ctx, row, pinned.rule.grant_amount_pkr);
  }
  return { status: row.status, decision, confidence, paymentRef, replay: false as const };
}

/**
 * Idempotent simulated payment. Consent + state are re-read under the profile lock right
 * before the reference is committed. Same case id ⇒ same reference, forever.
 */
export async function finalizePayment(tx: TransactionSql, ctx: Ctx, row: CaseRow, amountPkr: number) {
  const [fresh] = await tx<CaseRow[]>`select * from public.cases where id = ${row.id}::uuid`;
  if (fresh.mock_payment_ref) return fresh.mock_payment_ref; // replay: no new payment, no new audit
  if (fresh.status !== "AUTO_APPROVED" && fresh.status !== "OFFICER_APPROVED") {
    throw new AppError(409, "PAYMENT_NOT_APPROVED");
  }
  await appendAudit(tx, {
    ...userAudit(ctx), action: "MOCK_PAYMENT_ATTEMPTED", entityType: "case", entityId: row.id,
    outcome: "SUCCESS", metadata: { toolName: "simulateDemoPayment" },
  });
  if (!(await hasLiveConsent(tx, fresh.citizen_profile_id, null, "payment:simulate"))) {
    await tx`update public.cases set payment_status = 'BLOCKED' where id = ${row.id}::uuid`;
    throw new AppError(403, "CONSENT_REQUIRED");
  }
  const pay = mockDisburse({ caseId: row.id, amountPkr });
  await tx`update public.cases set mock_payment_ref = ${pay.reference}, payment_status = 'SIMULATED'
           where id = ${row.id}::uuid`;
  await moveStatus(tx, ctx, row, "MOCK_PAID", "MOCK_PAYMENT_SIMULATED", {
    toolName: "simulateDemoPayment",
    paymentRefHash: sha256(pay.reference),
    idempotent: true,
  });
  return pay.reference;
}

function reasonText(decision: "AUTO_APPROVED" | "MORE_PROOF" | "OFFICER_REVIEW") {
  if (decision === "AUTO_APPROVED") {
    return {
      en: "Your answers matched the checks. A SIMULATED relief payment reference was created. No real money was sent.",
      ur: "آپ کے جوابات جانچ سے مطابقت رکھتے ہیں۔ ایک فرضی (سمولیٹڈ) ادائیگی کا حوالہ بن گیا ہے۔ کوئی اصل رقم نہیں بھیجی گئی۔",
    };
  }
  if (decision === "MORE_PROOF") {
    return {
      en: "We need a little more proof before we can continue. See the list below.",
      ur: "آگے بڑھنے سے پہلے ہمیں تھوڑا اور ثبوت چاہیے۔ نیچے فہرست دیکھیں۔",
    };
  }
  return { en: NOT_SURE_EN, ur: NOT_SURE_UR };
}

export type OfficerDecision = "approve" | "reject" | "request_proof";
const ReasonSchema = z.string().trim().min(3).max(500);

export async function officerDecide(
  actor: VerifiedActor,
  caseId: string,
  decision: OfficerDecision,
  reasonInput: unknown,
) {
  const ctx = newCtx(actor);
  if (actor.role !== "officer") throw new AppError(403, "ROLE_FORBIDDEN");
  const parsed = ReasonSchema.safeParse(reasonInput);
  if (!parsed.success) throw new AppError(422, "REASON_REQUIRED");
  const reason = parsed.data;

  return withTransaction(async (tx) => {
    const [probe] = await tx<{ citizen_profile_id: string }[]>`
      select citizen_profile_id from public.cases where id = ${caseId}::uuid`;
    if (!probe) throw new AppError(404, "NOT_FOUND");
    await lockProfile(tx, probe.citizen_profile_id);
    const row = await lockCase(tx, caseId);
    if (row.assigned_officer_user_id !== actor.id) throw new AppError(404, "NOT_FOUND");
    if (!(await hasLiveConsent(tx, row.citizen_profile_id, null, "officer:review"))) {
      throw new AppError(403, "CONSENT_REQUIRED");
    }
    const [{ rules_json }] = await tx<{ rules_json: unknown }[]>`
      select rules_json from public.policy_rules where id = ${row.policy_rule_id}::uuid`;
    const rule = PolicyRuleSchema.parse(rules_json);
    const meta = { decision, beforeHash: sha256(row.status), afterHash: sha256(reason) };
    const reasonJson = JSON.stringify([{ code: "OFFICER_REQUEST", text: reason }]);

    if (decision === "approve") {
      await moveStatus(tx, ctx, row, "OFFICER_APPROVED", "OFFICER_DECISION", meta);
      await tx`update public.cases set officer_notes = ${reason}, decided_at = now(),
               user_reason_en = 'An officer reviewed and approved your case. A SIMULATED payment reference was created.',
               user_reason_ur = 'ایک افسر نے آپ کا کیس دیکھ کر منظور کر لیا۔ ایک فرضی (سمولیٹڈ) ادائیگی کا حوالہ بن گیا ہے۔'
               where id = ${caseId}::uuid`;
      await finalizePayment(tx, ctx, row, rule.grant_amount_pkr);
    } else if (decision === "reject") {
      await moveStatus(tx, ctx, row, "REJECTED", "OFFICER_DECISION", meta);
      await tx`update public.cases set officer_notes = ${reason}, decided_at = now(),
               user_reason_en = 'An officer reviewed your case and could not approve it in this simulation.',
               user_reason_ur = 'ایک افسر نے آپ کا کیس دیکھا اور اس فرضی نظام میں منظور نہیں کر سکا۔'
               where id = ${caseId}::uuid`;
    } else {
      await moveStatus(tx, ctx, row, "MORE_PROOF", "OFFICER_DECISION", meta);
      await tx`update public.cases set officer_notes = ${reason}, requested_proof = ${reasonJson}::text::jsonb,
               user_reason_en = 'An officer asked for more proof. See the list below.',
               user_reason_ur = 'ایک افسر نے مزید ثبوت مانگا ہے۔ نیچے فہرست دیکھیں۔'
               where id = ${caseId}::uuid`;
    }
    return { status: row.status };
  });
}
