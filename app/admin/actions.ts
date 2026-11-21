"use server";

import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import { AppError } from "@/lib/errors";
import { createDraft, publishPolicy, updateDraft } from "@/lib/services/policy";

const num = (f: FormData, k: string) => Number(f.get(k));

function rulesFromForm(f: FormData) {
  const list = (k: string) => String(f.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    minimum_age: num(f, "minimum_age"),
    widow_required: f.get("widow_required") === "on",
    max_household_income_pkr: num(f, "max_household_income_pkr"),
    max_prior_mock_grants: num(f, "max_prior_mock_grants"),
    allowed_districts: list("allowed_districts"),
    required_proofs: list("required_proofs"),
    grant_amount_pkr: num(f, "grant_amount_pkr"),
    priority_if_dependents_at_least: num(f, "priority_if_dependents_at_least"),
    confidence_thresholds: { approve: num(f, "approve"), ask_proof: num(f, "ask_proof") },
    loss_wrong_approval: num(f, "loss_wrong_approval"),
    loss_wait_for_review: num(f, "loss_wait_for_review"),
  };
}

export async function ruleAction(formData: FormData) {
  const op = String(formData.get("op") ?? "");
  const id = String(formData.get("id") ?? "");
  let result = "ok";
  try {
    const actor = await requireVerifiedActor();
    if (op === "create") await createDraft(actor, rulesFromForm(formData));
    else if (op === "update") await updateDraft(actor, id, rulesFromForm(formData));
    else if (op === "publish") await publishPolicy(actor, id);
    else result = "INVALID_OP";
  } catch (e) {
    result = e instanceof AppError || e instanceof AuthorizationError ? e.code : "SERVICE_ERROR";
  }
  redirect(`/admin/rules?${op}=${result}`);
}
