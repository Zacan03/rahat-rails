import "server-only";

import { appendAuditStandalone } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { hasLiveConsent } from "@/lib/auth/consent";
import type { VerifiedActor } from "@/lib/auth/types";
import { newCtx, userAudit } from "@/lib/services/shared";

export type ConsentRow = {
  id: string; kind: "platform" | "helper"; scopes: string[]; evidenceMode: string;
  grantedAt: Date; withdrawnAt: Date | null;
};

/**
 * The citizen owner may always see their own consent history. A helper sees it only while
 * their own grant is live; otherwise the page shows a neutral prompt (returns null).
 */
export async function listConsentFor(actor: VerifiedActor, profileId: string): Promise<ConsentRow[] | null> {
  const db = getDb();
  const [p] = await db<{ user_id: string | null }[]>`select user_id from public.citizen_profiles where id = ${profileId}::uuid`;
  if (!p) return null;
  const owner = actor.role === "citizen" && p.user_id === actor.id;
  const helperLive = actor.role === "helper" && (await hasLiveConsent(db, profileId, actor.id, "profile:read"));
  if (!owner && !helperLive) return null;
  const rows = await db<{ id: string; grantee_user_id: string | null; scopes: string[]; evidence_mode: string; granted_at: Date; withdrawn_at: Date | null }[]>`
    select id, grantee_user_id, scopes, evidence_mode, granted_at, withdrawn_at from public.consent_records
    where citizen_profile_id = ${profileId}::uuid and (${owner} or grantee_user_id is null or grantee_user_id = ${actor.id}::uuid)
    order by granted_at desc limit 50`;
  await appendAuditStandalone({ ...userAudit(newCtx(actor)), action: "CONSENT_VIEWED", entityType: "citizen_profile", entityId: profileId, outcome: "SUCCESS", metadata: { count: rows.length } });
  return rows.map((r) => ({
    id: r.id, kind: r.grantee_user_id ? "helper" : "platform", scopes: r.scopes, evidenceMode: r.evidence_mode,
    grantedAt: r.granted_at, withdrawnAt: r.withdrawn_at,
  }));
}
