import "server-only";

import type { Sql, TransactionSql } from "postgres";
import { AppError } from "@/lib/errors";
import type { VerifiedActor } from "@/lib/auth/types";

type Db = TransactionSql | Sql;

export const PLATFORM_SCOPES = [
  "platform:process",
  "identity:verify",
  "ai:process",
  "officer:review",
  "payment:simulate",
] as const;

export const HELPER_SCOPES = ["profile:read", "profile:correct", "case:read", "case:write"] as const;

/** Serialises consent changes with every processing/payment preflight for one profile. */
export async function lockProfile(tx: Db, profileId: string) {
  await tx`select pg_advisory_xact_lock(hashtext(${"profile:" + profileId}))`;
}

/** Live DB read — never cached, never taken from a token. */
export async function hasLiveConsent(
  tx: Db,
  profileId: string,
  granteeUserId: string | null,
  scope: string,
): Promise<boolean> {
  const rows = await tx`
    select 1 from public.consent_records
    where citizen_profile_id = ${profileId}::uuid
      and grantee_user_id is not distinct from ${granteeUserId}::uuid
      and withdrawn_at is null
      and ${scope} = any(scopes)
    limit 1`;
  return rows.length > 0;
}

export async function requireLivePlatformConsent(tx: Db, profileId: string, scope: string) {
  if (!(await hasLiveConsent(tx, profileId, null, scope))) {
    throw new AppError(403, "CONSENT_REQUIRED");
  }
}

export type ProfileRow = {
  id: string;
  user_id: string | null;
  demo_identity_id: string;
  display_name: string;
};

/**
 * Object access: the citizen who owns the profile, OR a helper holding an exact, live,
 * per-family grant for `scope`. Everything else is a 404 (no enumeration).
 */
export async function requireProfileAccess(
  tx: Db,
  actor: VerifiedActor,
  profileId: string,
  scope: string,
): Promise<ProfileRow> {
  const [profile] = await tx<ProfileRow[]>`
    select id, user_id, demo_identity_id, display_name
    from public.citizen_profiles where id = ${profileId}::uuid`;
  if (!profile) throw new AppError(404, "NOT_FOUND");

  if (actor.role === "citizen" && profile.user_id === actor.id) return profile;
  if (actor.role === "helper" && (await hasLiveConsent(tx, profile.id, actor.id, scope))) {
    return profile;
  }
  throw new AppError(404, "NOT_FOUND");
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
