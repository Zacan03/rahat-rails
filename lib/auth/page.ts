import "server-only";

import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import type { AppRole, VerifiedActor } from "@/lib/auth/types";

/** Verified session + fresh DB role for a page. Redirects (401) or shows 403 via redirect. */
export async function requirePageActor(allowed: readonly AppRole[]): Promise<VerifiedActor> {
  let actor: VerifiedActor;
  try {
    actor = await requireVerifiedActor();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(error.statusCode === 401 ? "/login" : "/login?error=account");
    }
    throw error;
  }
  if (!allowed.includes(actor.role)) redirect("/dashboard?denied=1");
  return actor;
}
