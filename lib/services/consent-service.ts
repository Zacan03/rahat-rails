import "server-only";

import { randomUUID } from "node:crypto";
import { appendAudit } from "@/lib/db/audit";
import { withTransaction } from "@/lib/db/transactions";
import { getDb } from "@/lib/db/client";
import {
  HELPER_SCOPES,
  PLATFORM_SCOPES,
  hasLiveConsent,
  lockProfile,
} from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";
import { newCtx, userAudit, type Ctx } from "@/lib/services/shared";
import { canTransition, type CaseStatus } from "@/lib/domain/case-machine";

/**
 * Records witnessed demo consent. Selecting a family is NOT consent: this only runs from an
 * explicit acknowledgement. Helper and platform grants are independent rows per family.
 */
export async function grantConsent(actor: VerifiedActor, profileId: string, witnessed: boolean) {
  const ctx = newCtx(actor);
  if (actor.role !== "citizen" && actor.role !== "helper") throw new AppError(403, "ROLE_FORBIDDEN");
  if (!witnessed) throw new AppError(422, "ACKNOWLEDGEMENT_REQUIRED");

  await withTransaction(async (tx) => {
    await lockProfile(tx, profileId);
    const [profile] = await tx`select id, user_id from public.citizen_profiles where id = ${profileId}::uuid`;
    if (!profile) throw new AppError(404, "NOT_FOUND");
    if (actor.role === "citizen" && profile.user_id !== actor.id) throw new AppError(404, "NOT_FOUND");

    const mode = actor.role === "citizen" ? "citizen_tap" : "assisted_tap_demo";
    const evidence = `DEMO:${mode}:${randomUUID().slice(0, 8)}`;
    const grants: { grantee: string | null; scopes: readonly string[] }[] = [
      { grantee: null, scopes: PLATFORM_SCOPES },
    ];
    if (actor.role === "helper") grants.push({ grantee: actor.id, scopes: HELPER_SCOPES });

    for (const g of grants) {
      const live = await hasLiveConsent(tx, profileId, g.grantee, g.scopes[0]);
      if (live) continue;
      await tx`
        insert into public.consent_records
          (citizen_profile_id, grantee_user_id, granted_by_user_id, scopes, evidence_mode, evidence_reference)
        values (${profileId}::uuid, ${g.grantee}::uuid, ${actor.id}::uuid, ${[...g.scopes]}::text[],
                ${mode}, ${evidence})`;
      await appendAudit(tx, {
        ...userAudit(ctx),
        action: "CONSENT_GRANTED",
        entityType: "citizen_profile",
        entityId: profileId,
        outcome: "SUCCESS",
        metadata: { scopes: [...g.scopes], grantee: g.grantee ? "helper" : "platform", mode },
      });
    }
  });
}

const WITHDRAWABLE: CaseStatus[] = [
  "DRAFT", "SUBMITTED", "CHECKING", "MORE_PROOF", "OFFICER_REVIEW",
  "AUTO_APPROVED", "OFFICER_APPROVED", "ESCALATED",
];

/**
 * Immediate take-back: all live grants for this family end in one transaction, open cases
 * move to CONSENT_WITHDRAWN. The advisory lock is shared with every processing/payment tx.
 * Other families are untouched.
 */
export async function withdrawConsent(actor: VerifiedActor, profileId: string) {
  const ctx: Ctx = newCtx(actor);
  await withTransaction(async (tx) => {
    await lockProfile(tx, profileId);
    const [profile] = await tx`select id, user_id from public.citizen_profiles where id = ${profileId}::uuid`;
    if (!profile) throw new AppError(404, "NOT_FOUND");
    const isOwner = actor.role === "citizen" && profile.user_id === actor.id;
    const isHelper = actor.role === "helper" && (await hasLiveConsent(tx, profileId, actor.id, "profile:read"));
    if (!isOwner && !isHelper) throw new AppError(404, "NOT_FOUND");

    const ended = await tx`
      update public.consent_records set withdrawn_at = now(), withdrawn_by_user_id = ${actor.id}::uuid
      where citizen_profile_id = ${profileId}::uuid and withdrawn_at is null
      returning id`;
    await appendAudit(tx, {
      ...userAudit(ctx),
      action: "CONSENT_WITHDRAWN",
      entityType: "citizen_profile",
      entityId: profileId,
      outcome: "SUCCESS",
      metadata: { count: ended.length, mode: isOwner ? "citizen" : "assisted" },
    });

    const open = await tx<{ id: string; status: CaseStatus }[]>`
      select id, status from public.cases where citizen_profile_id = ${profileId}::uuid for update`;
    for (const c of open) {
      if (!WITHDRAWABLE.includes(c.status) || !canTransition(c.status, "CONSENT_WITHDRAWN")) continue;
      await tx`update public.cases set status = 'CONSENT_WITHDRAWN', updated_at = now(), closed_at = now()
               where id = ${c.id}::uuid`;
      await appendAudit(tx, {
        ...userAudit(ctx),
        action: "CONSENT_WITHDRAWN",
        entityType: "case",
        entityId: c.id,
        outcome: "SUCCESS",
        metadata: { fromStatus: c.status, toStatus: "CONSENT_WITHDRAWN" },
      });
    }
  });
}

export async function liveConsentSummary(profileId: string, helperId: string | null) {
  const db = getDb();
  return {
    platform: await hasLiveConsent(db, profileId, null, "platform:process"),
    helper: helperId ? await hasLiveConsent(db, profileId, helperId, "case:write") : false,
  };
}
