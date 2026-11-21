import "server-only";

import { getDb } from "@/lib/db/client";
import { appendAuditStandalone } from "@/lib/db/audit";
import { hasLiveConsent } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import { newCtx, userAudit, auditDenied } from "@/lib/services/shared";

export type FamilyCard = { id: string; demoIdentityId: string; displayName: string; hasConsent: boolean };

/** Neutral family picker: synthetic pseudonyms only; showing a card is NOT consent. */
export async function listFamilies(actor: VerifiedActor): Promise<FamilyCard[]> {
  if (actor.role !== "helper") throw new AppError(403, "ROLE_FORBIDDEN");
  const rows = await getDb()<{ id: string; demo_identity_id: string; display_name: string; granted: boolean }[]>`
    select p.id, p.demo_identity_id, p.display_name,
      exists (select 1 from public.consent_records c where c.citizen_profile_id = p.id
              and c.grantee_user_id = ${actor.id}::uuid and c.withdrawn_at is null) as granted
    from public.citizen_profiles p order by p.demo_identity_id`;
  return rows.map((r) => ({
    id: r.id,
    demoIdentityId: r.demo_identity_id,
    displayName: r.display_name,
    hasConsent: r.granted,
  }));
}

export type ProfileContext = {
  id: string;
  demoIdentityId: string;
  displayName: string;
  prefillIndex: number | null;
  consent: { platform: boolean; helper: boolean };
  isOwner: boolean;
};

/**
 * Resolve the profile for the claim screen. Returns identity labels only (no case data);
 * detailed access still needs per-request consent in the services.
 */
export async function resolveProfileForActor(actor: VerifiedActor, requestedId: string | null): Promise<ProfileContext | null> {
  const db = getDb();
  let rows;
  if (actor.role === "citizen") {
    rows = await db<{ id: string; demo_identity_id: string; display_name: string; user_id: string | null }[]>`
      select id, demo_identity_id, display_name, user_id from public.citizen_profiles where user_id = ${actor.id}::uuid`;
  } else if (actor.role === "helper" && requestedId) {
    rows = await db<{ id: string; demo_identity_id: string; display_name: string; user_id: string | null }[]>`
      select id, demo_identity_id, display_name, user_id from public.citizen_profiles where id = ${requestedId}::uuid`;
  } else {
    return null;
  }
  const p = rows[0];
  if (!p) return null;
  const platform = await hasLiveConsent(db, p.id, null, "platform:process");
  const helper = actor.role === "helper" ? await hasLiveConsent(db, p.id, actor.id, "case:write") : false;
  const m = /^DEMO-WD-(\d{3})$/.exec(p.demo_identity_id);
  return {
    id: p.id,
    demoIdentityId: p.demo_identity_id,
    displayName: p.display_name,
    prefillIndex: m ? Number(m[1]) : null,
    consent: { platform, helper },
    isOwner: p.user_id === actor.id,
  };
}

export type CaseView = {
  id: string;
  status: string;
  confidence: number | null;
  factorScores: Record<string, number>;
  hardGates: Record<string, boolean>;
  reasonEn: string | null;
  reasonUr: string | null;
  requestedProof: { code: string; text: string }[];
  paymentStatus: string;
  mockPaymentRef: string | null;
  policyVersion: number | null;
  demoIdentityId: string;
  timeline: { action: string; outcome: string; at: Date }[];
  answers: Record<string, unknown>;
  consentWithdrawn: boolean;
  profileId: string;
};

type CaseDbRow = {
  id: string; status: string; confidence: string | null; factor_scores: Record<string, number>;
  hard_gates: Record<string, boolean>; user_reason_en: string | null; user_reason_ur: string | null;
  requested_proof: { code: string; text: string }[]; payment_status: string; mock_payment_ref: string | null;
  version: number | null; demo_identity_id: string; user_id: string | null; citizen_profile_id: string;
  claim_answers: Record<string, unknown>;
};

/**
 * Citizen/helper case read. Citizen owner may always read their own case (even after
 * withdrawal). A helper needs live per-family grants + platform consent on every read.
 */
export async function loadCaseForActor(actor: VerifiedActor, caseId: string): Promise<CaseView> {
  const ctx = newCtx(actor);
  const db = getDb();
  const [row] = await db<CaseDbRow[]>`
    select c.id, c.status, c.confidence, c.factor_scores, c.hard_gates, c.user_reason_en, c.user_reason_ur,
           c.requested_proof, c.payment_status, c.mock_payment_ref, pr.version, p.demo_identity_id, p.user_id,
           c.citizen_profile_id, c.claim_answers
    from public.cases c
    join public.citizen_profiles p on p.id = c.citizen_profile_id
    left join public.policy_rules pr on pr.id = c.policy_rule_id
    where c.id = ${caseId}::uuid`;
  let allowed = false;
  if (row) {
    if (actor.role === "citizen") allowed = row.user_id === actor.id;
    else if (actor.role === "helper") {
      allowed =
        (await hasLiveConsent(db, row.citizen_profile_id, actor.id, "case:read")) &&
        (await hasLiveConsent(db, row.citizen_profile_id, null, "platform:process"));
    }
  }
  if (!row || !allowed) {
    await auditDenied(ctx, "CASE_VIEW", "case", row ? row.id : null, "NO_ACCESS");
    throw new AppError(404, "NOT_FOUND");
  }
  await appendAuditStandalone({
    ...userAudit(ctx), action: "CASE_VIEWED", entityType: "case", entityId: row.id, outcome: "SUCCESS",
  });
  const timeline = await db<{ action: string; outcome: string; occurred_at: Date }[]>`
    select action, outcome, occurred_at from public.audit_logs
    where entity_type = 'case' and entity_id = ${row.id}::uuid order by id asc`;
  return {
    id: row.id,
    status: row.status,
    confidence: row.confidence === null ? null : Number(row.confidence),
    factorScores: row.factor_scores,
    hardGates: row.hard_gates,
    reasonEn: row.user_reason_en,
    reasonUr: row.user_reason_ur,
    requestedProof: row.requested_proof,
    paymentStatus: row.payment_status,
    mockPaymentRef: row.mock_payment_ref,
    policyVersion: row.version,
    demoIdentityId: row.demo_identity_id,
    timeline: timeline.map((t) => ({ action: t.action, outcome: t.outcome, at: t.occurred_at })),
    answers: row.claim_answers,
    consentWithdrawn: row.status === "CONSENT_WITHDRAWN",
    profileId: row.citizen_profile_id,
  };
}

export type QueueRow =
  | { redacted: false; id: string; priority: number; confidence: number | null; status: string; demoIdentityId: string; createdAt: Date }
  | { redacted: true; id: string; priority: number; status: string; createdAt: Date };

export async function loadOfficerQueue(actor: VerifiedActor): Promise<QueueRow[]> {
  if (actor.role !== "officer") throw new AppError(403, "ROLE_FORBIDDEN");
  const ctx = newCtx(actor);
  const db = getDb();
  const rows = await db<{
    id: string; priority: number; confidence: string | null; status: string; created_at: Date;
    demo_identity_id: string; live: boolean;
  }[]>`
    select c.id, c.priority, c.confidence, c.status, c.created_at, p.demo_identity_id,
      exists (select 1 from public.consent_records k where k.citizen_profile_id = c.citizen_profile_id
              and k.grantee_user_id is null and k.withdrawn_at is null and 'officer:review' = any(k.scopes)) as live
    from public.cases c join public.citizen_profiles p on p.id = c.citizen_profile_id
    where c.assigned_officer_user_id = ${actor.id}::uuid and c.status in ('OFFICER_REVIEW','ESCALATED')
    order by c.priority desc, c.confidence asc nulls first, c.created_at asc`;
  await appendAuditStandalone({
    ...userAudit(ctx), action: "QUEUE_VIEWED", entityType: "case_queue", entityId: null,
    outcome: "SUCCESS", metadata: { queueSize: rows.length },
  });
  return rows.map((r) =>
    r.live
      ? { redacted: false, id: r.id, priority: r.priority, confidence: r.confidence === null ? null : Number(r.confidence), status: r.status, demoIdentityId: r.demo_identity_id, createdAt: r.created_at }
      : { redacted: true, id: r.id, priority: r.priority, status: r.status, createdAt: r.created_at },
  );
}

export type OfficerCaseView = CaseView & {
  notes: string[];
  failedGates: string[];
  auditorExplanation: Record<string, unknown>;
  officerNotes: string | null;
};

export async function loadOfficerCase(actor: VerifiedActor, caseId: string): Promise<OfficerCaseView> {
  if (actor.role !== "officer") throw new AppError(403, "ROLE_FORBIDDEN");
  const ctx = newCtx(actor);
  const db = getDb();
  const [row] = await db<(CaseDbRow & { assigned_officer_user_id: string | null; auditor_explanation: Record<string, unknown>; officer_notes: string | null })[]>`
    select c.id, c.status, c.confidence, c.factor_scores, c.hard_gates, c.user_reason_en, c.user_reason_ur,
           c.requested_proof, c.payment_status, c.mock_payment_ref, pr.version, p.demo_identity_id, p.user_id,
           c.citizen_profile_id, c.claim_answers, c.assigned_officer_user_id, c.auditor_explanation, c.officer_notes
    from public.cases c
    join public.citizen_profiles p on p.id = c.citizen_profile_id
    left join public.policy_rules pr on pr.id = c.policy_rule_id
    where c.id = ${caseId}::uuid`;
  if (!row || row.assigned_officer_user_id !== actor.id) {
    await auditDenied(ctx, "OFFICER_CASE_VIEW", "case", null, "NOT_ASSIGNED");
    throw new AppError(404, "NOT_FOUND");
  }
  if (!(await hasLiveConsent(db, row.citizen_profile_id, null, "officer:review"))) {
    await auditDenied(ctx, "OFFICER_CASE_VIEW", "case", row.id, "CONSENT_REQUIRED");
    throw new AppError(403, "CONSENT_REQUIRED");
  }
  await appendAuditStandalone({
    ...userAudit(ctx), action: "CASE_VIEWED", entityType: "case", entityId: row.id, outcome: "SUCCESS",
  });
  const failedGates = Object.entries(row.hard_gates ?? {}).filter(([, v]) => v === false).map(([k]) => k);
  const factors = row.factor_scores ?? {};
  const notes = [
    `Automated deterministic notes (no AI approval was made). Confidence ${row.confidence ?? "n/a"} under synthetic rule v${row.version ?? "?"}.`,
    failedGates.length ? `Failed hard gates: ${failedGates.join(", ")}.` : "All hard gates passed.",
    `Factors — identity ${factors.I ?? "n/a"}, eligibility ${factors.E ?? "n/a"}, document ${factors.D ?? "n/a"}, uniqueness ${factors.U ?? "n/a"}, channel ${factors.S ?? "n/a"}, completeness ${factors.F ?? "n/a"}.`,
    "Names alone never establish identity; aliases are candidates only.",
  ];
  return {
    id: row.id, status: row.status, confidence: row.confidence === null ? null : Number(row.confidence),
    factorScores: factors, hardGates: row.hard_gates, reasonEn: row.user_reason_en, reasonUr: row.user_reason_ur,
    requestedProof: row.requested_proof, paymentStatus: row.payment_status, mockPaymentRef: row.mock_payment_ref,
    policyVersion: row.version, demoIdentityId: row.demo_identity_id, timeline: [], answers: row.claim_answers,
    consentWithdrawn: false, profileId: row.citizen_profile_id, notes, failedGates,
    auditorExplanation: row.auditor_explanation, officerNotes: row.officer_notes,
  };
}
