import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/page";
import { isUuid } from "@/lib/auth/consent";
import { AppError } from "@/lib/errors";
import { loadCaseForActor } from "@/lib/services/views";
import { STATUS_LABEL } from "@/lib/i18n/strings";

export const instant = false;

export default function CaseDetailPage(props: PageProps<"/citizen/cases/[caseId]">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <CaseContent params={props.params} />
    </Suspense>
  );
}

async function CaseContent({ params }: { params: Promise<{ caseId: string }> }) {
  await connection();
  const actor = await requirePageActor(["citizen", "helper"]);
  const { caseId } = await params;
  if (!isUuid(caseId)) notFound();
  let c;
  try {
    c = await loadCaseForActor(actor, caseId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const label = STATUS_LABEL[c.status];
  const gates = Object.entries(c.hardGates ?? {});

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{c.demoIdentityId} · SYNTHETIC DEMO RULE v{c.policyVersion ?? "—"}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {label?.en ?? c.status} <span dir="rtl" className="text-slate-600">/ {label?.ur}</span>
          </h1>
        </header>

        {c.consentWithdrawn && (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4">Consent was withdrawn. No further processing will happen on this case.</p>
        )}

        {(c.reasonEn || c.reasonUr) && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Why this result</h2>
            <p className="mt-2 text-lg">{c.reasonEn}</p>
            <p className="mt-2 text-lg" dir="rtl">{c.reasonUr}</p>
            {c.confidence !== null && (
              <p className="mt-3 text-sm text-slate-600">
                Confidence score {c.confidence.toFixed(4)} — an uncalibrated demo heuristic, not a real probability.
              </p>
            )}
          </section>
        )}

        {c.requestedProof.length > 0 && (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6">
            <h2 className="font-semibold">Proof requested</h2>
            <ul className="mt-2 list-disc pl-5">{c.requestedProof.map((r) => <li key={r.code}>{r.text}</li>)}</ul>
            {c.status === "MORE_PROOF" && (
              <Link className="mt-3 inline-block font-semibold text-teal-800 underline" href={`/citizen/claim?profile=${c.profileId}`}>Add proof and resubmit</Link>
            )}
          </section>
        )}

        {c.mockPaymentRef && (
          <section className="rounded-3xl border border-teal-300 bg-teal-50 p-6">
            <h2 className="font-semibold">Simulated payment reference</h2>
            <p className="mt-2 font-mono text-xl">{c.mockPaymentRef}</p>
            <p className="mt-2 text-sm">SIMULATED ONLY — no real money was sent. This is a mock Raast reference. / کوئی اصل رقم نہیں بھیجی گئی۔</p>
          </section>
        )}

        {gates.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Safety checks</h2>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {gates.map(([k, v]) => (
                <li key={k}>{v ? "✓" : "✗"} {k}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Status history</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {c.timeline.map((t, i) => (
              <li key={i}>{new Date(t.at).toISOString().slice(0, 19).replace("T", " ")} — {t.action} ({t.outcome})</li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
