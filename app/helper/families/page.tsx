import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { listFamilies } from "@/lib/services/views";
import { consentToggleAction } from "@/app/citizen/consent/actions";
import { ClearLocalState } from "@/components/helper/clear-local-state";

export const instant = false;

export default function FamiliesPage(props: PageProps<"/helper/families">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <FamiliesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function FamiliesContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const actor = await requirePageActor(["helper"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 40) : "";
  const all = await listFamilies(actor);
  const families = q ? all.filter((f) => f.demoIdentityId.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q)) : all;

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <ClearLocalState />
      <div className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Choose a family (40 synthetic households)</h1>
        <p className="mt-2 text-sm text-slate-600">Choosing a family is not consent. You will be asked to record the citizen&apos;s permission first.</p>
        {(typeof sp.grant === "string" || typeof sp.withdraw === "string") && (
          <p role="status" className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm">
            {sp.grant === "ok" ? "Permission recorded for that family only." : sp.withdraw === "ok" ? "Permission withdrawn for that family only. Access is blocked now." : `Action blocked (${String(sp.grant ?? sp.withdraw)}).`}
          </p>
        )}
        <form className="mt-4 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Search DEMO-WD-001 or a name" className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4" aria-label="Search families" />
          <button className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white" type="submit">Search</button>
        </form>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((f) => (
            <li key={f.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-sm font-semibold">{f.demoIdentityId}</p>
              <p className="text-sm text-slate-700">{f.displayName}</p>
              <p className={`mt-1 text-xs font-semibold ${f.hasConsent ? "text-teal-800" : "text-slate-500"}`}>
                {f.hasConsent ? "● Permission active" : "○ No permission"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/citizen/claim?profile=${f.id}`} className="inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white">Open claim</Link>
                <Link href={`/citizen/consent?profile=${f.id}`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold">Consent</Link>
              </div>
              <form action={consentToggleAction} className="mt-3 space-y-2">
                <input type="hidden" name="profileId" value={f.id} />
                <input type="hidden" name="from" value="families" />
                {f.hasConsent ? (
                  <button name="op" value="withdraw" className="min-h-12 w-full rounded-xl border border-rose-400 px-4 text-sm font-semibold text-rose-800">Withdraw this family only</button>
                ) : (
                  <>
                    <label className="flex items-start gap-2 text-xs font-semibold">
                      <input type="checkbox" name="witnessed" className="mt-0.5 size-5" required />
                      Citizen is present and said yes (simulated witness)
                    </label>
                    <button name="op" value="grant" className="min-h-12 w-full rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900">Record permission</button>
                  </>
                )}
              </form>
            </li>
          ))}
        </ul>
        {families.length === 0 && <p className="mt-6">No matching family.</p>}
      </div>
    </main>
  );
}
