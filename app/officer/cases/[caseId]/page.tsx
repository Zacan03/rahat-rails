import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/page";
import { isUuid } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import { loadOfficerCase } from "@/lib/services/views";
import { officerDecisionAction } from "@/app/officer/actions";

export const instant = false;

export default function OfficerCasePage(props: PageProps<"/officer/cases/[caseId]">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <OfficerCaseContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function OfficerCaseContent({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const actor = await requirePageActor(["officer"]);
  const { caseId } = await params;
  const sp = await searchParams;
  if (!isUuid(caseId)) notFound();

  let c;
  try {
    c = await loadOfficerCase(actor, caseId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    if (e instanceof AppError && e.status === 403) {
      return (
        <main className="flex-1 px-5 py-8 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h1 className="text-xl font-semibold">Access blocked</h1>
            <p className="mt-2">The citizen&apos;s consent is not active. This case&apos;s evidence cannot be shown. <Link className="underline" href="/officer/queue">Back to queue</Link></p>
          </div>
        </main>
      );
    }
    throw e;
  }
  const error = typeof sp.error === "string" ? sp.error : null;
  const open = c.status === "OFFICER_REVIEW" || c.status === "ESCALATED";

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link className="text-sm font-semibold text-teal-800" href="/officer/queue">← Queue</Link>
        <header>
          <p className="font-mono text-sm">{c.demoIdentityId} · SYNTHETIC DEMO RULE v{c.policyVersion ?? "—"}</p>
          <h1 className="text-3xl font-semibold">Case review — {c.status}</h1>
          <p className="mt-1 text-sm">Confidence {c.confidence?.toFixed(4) ?? "n/a"}</p>
        </header>
        {c.reasonEn && (
          <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-semibold">{c.reasonEn}</p>
        )}
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Case notes (deterministic, attached to handoff)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <h3 className="mt-4 font-semibold">Hard gates</h3>
          <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(c.hardGates ?? {}).map(([k, v]) => <li key={k}>{v ? "✓" : "✗"} {k}</li>)}
          </ul>
        </section>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">Action blocked ({error}).</p>}
        {open ? (
          <form action={officerDecisionAction} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
            <input type="hidden" name="caseId" value={c.id} />
            <label className="block">
              <span className="mb-2 block font-semibold">Reason (required, 3–500 chars)</span>
              <textarea name="reason" required minLength={3} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-300 p-3" />
            </label>
            <div className="flex flex-wrap gap-3">
              <button name="decision" value="approve" className="min-h-12 rounded-xl bg-teal-800 px-6 font-semibold text-white">Approve (simulated payment)</button>
              <button name="decision" value="request_proof" className="min-h-12 rounded-xl border border-slate-400 bg-white px-6 font-semibold">Request proof</button>
              <button name="decision" value="reject" className="min-h-12 rounded-xl border border-rose-400 bg-white px-6 font-semibold text-rose-800">Reject</button>
            </div>
          </form>
        ) : (
          <p className="rounded-2xl bg-slate-100 p-4">This case is {c.status}; no further officer action is available.{c.mockPaymentRef && <> Ref: <span className="font-mono">{c.mockPaymentRef}</span> (SIMULATED)</>}</p>
        )}
      </div>
    </main>
  );
}
