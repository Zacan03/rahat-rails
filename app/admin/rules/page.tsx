import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { listPolicies, type PolicyListRow } from "@/lib/services/policy";
import { ruleAction } from "@/app/admin/actions";

export const instant = false;

export default function RulesPage(props: PageProps<"/admin/rules">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <RulesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const input = "min-h-11 w-full rounded-lg border border-slate-300 px-3";

function Fields({ r }: { r: Record<string, unknown> }) {
  const t = (r.confidence_thresholds ?? {}) as { approve?: number; ask_proof?: number };
  const f = (name: string, label: string, v: unknown, step?: string) => (
    <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
      <input className={input} name={name} defaultValue={String(v ?? "")} step={step} /></label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {f("minimum_age", "Minimum age", r.minimum_age)}
      {f("max_household_income_pkr", "Max household income (PKR)", r.max_household_income_pkr)}
      {f("max_prior_mock_grants", "Max prior simulated grants", r.max_prior_mock_grants)}
      {f("grant_amount_pkr", "Grant amount (PKR, simulated)", r.grant_amount_pkr)}
      {f("allowed_districts", "Allowed districts (comma list)", (r.allowed_districts as string[] | undefined)?.join(","))}
      {f("required_proofs", "Required proofs (comma list)", (r.required_proofs as string[] | undefined)?.join(","))}
      {f("priority_if_dependents_at_least", "Priority if dependents ≥", r.priority_if_dependents_at_least)}
      {f("approve", "Auto-approve threshold (≥ 0.85)", t.approve, "0.01")}
      {f("ask_proof", "Ask-for-proof threshold (≥ 0.60)", t.ask_proof, "0.01")}
      {f("loss_wrong_approval", "Loss: wrong approval", r.loss_wrong_approval)}
      {f("loss_wait_for_review", "Loss: wait for review", r.loss_wait_for_review)}
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="widow_required" className="size-5" defaultChecked={r.widow_required === true} /> Widow status required
      </label>
    </div>
  );
}

async function RulesContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const actor = await requirePageActor(["admin"]);
  const sp = await searchParams;
  const policies: PolicyListRow[] = await listPolicies(actor);
  const active = policies.find((p) => p.status === "active");
  const flash = ["create", "update", "publish"].map((k) => (typeof sp[k] === "string" ? `${k}:${sp[k]}` : null)).find(Boolean);

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Synthetic policy rules</h1>
        <p className="text-sm text-slate-600">SYNTHETIC DEMO RULES — invented for this simulation, not a real government policy. Published versions are immutable; changing rules means publishing a new version. Existing cases stay pinned to the version they were decided under. No private citizen data is shown here.</p>
        {flash && <p role="status" className="rounded-xl bg-slate-100 px-4 py-2 text-sm">{flash.endsWith(":ok") ? `Done (${flash.split(":")[0]}).` : `Blocked: ${flash}`}</p>}

        {policies.map((p) => (
          <section key={p.id} className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">Version {p.version}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === "active" ? "bg-teal-800 text-white" : p.status === "draft" ? "bg-amber-200" : "bg-slate-200"}`}>{p.status}</span>
              <span className="text-xs text-slate-600">{p.casesPinned} case(s) pinned to this version</span>
            </div>
            {p.status === "draft" ? (
              <form action={ruleAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={p.id} />
                <Fields r={p.rules} />
                <div className="flex flex-wrap gap-3">
                  <button name="op" value="update" className="min-h-12 rounded-xl border border-slate-400 px-5 font-semibold">Save draft</button>
                  <button name="op" value="publish" className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white">Publish v{p.version} now (no redeploy)</button>
                </div>
              </form>
            ) : (
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(p.rules, null, 2)}</pre>
            )}
          </section>
        ))}

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Create a new draft version</h2>
          <p className="text-xs text-slate-600">Starts from the active rule. Thresholds can be raised but never lowered below 0.85 / 0.60.</p>
          <form action={ruleAction} className="mt-4 space-y-4">
            <Fields r={active?.rules ?? {}} />
            <button name="op" value="create" className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white">Create draft</button>
          </form>
        </section>
      </div>
    </main>
  );
}
