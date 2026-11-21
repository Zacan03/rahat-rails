"use server";

import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import { isUuid } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import { grantConsent, withdrawConsent } from "@/lib/services/consent-service";

/** Grant (witnessed) or withdraw consent for ONE family. Revocation is immediate. */
export async function consentToggleAction(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  const op = String(formData.get("op") ?? "");
  const from = formData.get("from") === "families" ? "families" : "consent";
  if (!isUuid(profileId) || (op !== "grant" && op !== "withdraw")) redirect("/dashboard");

  const base = from === "families" ? "/helper/families" : `/citizen/consent?profile=${profileId}`;
  const sep = base.includes("?") ? "&" : "?";
  let result = "ok";
  try {
    const actor = await requireVerifiedActor();
    if (op === "grant") await grantConsent(actor, profileId, formData.get("witnessed") === "on");
    else await withdrawConsent(actor, profileId);
  } catch (e) {
    result = e instanceof AppError || e instanceof AuthorizationError ? e.code : "SERVICE_ERROR";
  }
  redirect(`${base}${sep}${op}=${result}`);
}
