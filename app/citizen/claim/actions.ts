"use server";

import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import { isUuid } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import { grantConsent, withdrawConsent } from "@/lib/services/consent-service";
import { saveDraft, submitCase } from "@/lib/services/claims";

type ActionResult = { ok: true; caseId?: string } | { ok: false; code: string };

function codeOf(e: unknown): string {
  if (e instanceof AppError) return e.code;
  if (e instanceof AuthorizationError) return e.code;
  return "SERVICE_ERROR";
}

export async function grantConsentAction(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  const witnessed = formData.get("witnessed") === "on";
  const back = (code?: string) =>
    `/citizen/claim?profile=${encodeURIComponent(profileId)}${code ? `&error=${code}` : ""}`;
  if (!isUuid(profileId)) redirect("/citizen/claim?error=NOT_FOUND");
  try {
    const actor = await requireVerifiedActor();
    await grantConsent(actor, profileId, witnessed);
  } catch (e) {
    redirect(back(codeOf(e)));
  }
  redirect(back());
}

export async function withdrawConsentAction(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  if (!isUuid(profileId)) redirect("/citizen/claim?error=NOT_FOUND");
  let target = `/citizen/claim?profile=${encodeURIComponent(profileId)}&withdrawn=1`;
  try {
    const actor = await requireVerifiedActor();
    await withdrawConsent(actor, profileId);
  } catch (e) {
    target = `/citizen/claim?profile=${encodeURIComponent(profileId)}&error=${codeOf(e)}`;
  }
  redirect(target);
}

/** Called by the client wizard after each step. The server re-verifies everything. */
export async function saveDraftAction(caseId: string, answers: unknown): Promise<ActionResult> {
  if (!isUuid(caseId)) return { ok: false, code: "NOT_FOUND" };
  try {
    const actor = await requireVerifiedActor();
    await saveDraft(actor, caseId, answers);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: codeOf(e) };
  }
}

export async function submitClaimAction(caseId: string, answers: unknown): Promise<ActionResult> {
  if (!isUuid(caseId)) return { ok: false, code: "NOT_FOUND" };
  try {
    const actor = await requireVerifiedActor();
    await submitCase(actor, caseId, answers);
    return { ok: true, caseId };
  } catch (e) {
    return { ok: false, code: codeOf(e) };
  }
}
