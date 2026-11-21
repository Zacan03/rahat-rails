"use server";

import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import { isUuid } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import { officerDecide, type OfficerDecision } from "@/lib/services/claims";
import { auditDenied, newCtx } from "@/lib/services/shared";

const DECISIONS: OfficerDecision[] = ["approve", "reject", "request_proof"];

export async function officerDecisionAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const decision = String(formData.get("decision") ?? "") as OfficerDecision;
  const reason = formData.get("reason");
  if (!isUuid(caseId) || !DECISIONS.includes(decision)) redirect("/officer/queue?error=INVALID");

  let target = "/officer/queue?done=1";
  try {
    const actor = await requireVerifiedActor();
    try {
      await officerDecide(actor, caseId, decision, reason);
    } catch (e) {
      if (e instanceof AppError && (e.status === 403 || e.status === 404)) {
        await auditDenied(newCtx(actor), "OFFICER_DECISION", "case", caseId, e.code);
      }
      throw e;
    }
  } catch (e) {
    const code = e instanceof AppError || e instanceof AuthorizationError ? e.code : "SERVICE_ERROR";
    target = `/officer/cases/${caseId}?error=${code}`;
  }
  redirect(target);
}
