import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { loadOfficerQueue } from "@/lib/services/views";
import { STATUS_LABEL } from "@/lib/i18n/strings";

export const instant = false;

export default function QueuePage() {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <QueueContent />
    </Suspense>
  );
}

async function QueueContent() {
  await connection();
  const actor = await requirePageActor(["officer"]);
  const rows = await loadOfficerQueue(actor);

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Officer review queue</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sorted by priority (high first), then confidence (low first), then oldest. Evidence is visible only while the citizen&apos;s consent is live.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr><th className="p-3">Priority</th><th className="p-3">Confidence</th><th className="p-3">Status</th><th className="p-3">Family</th><th className="p-3">Opened</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="p-3 font-semibold">{r.priority}</td>
                  {r.redacted ? (
                    <>
                      <td className="p-3 text-slate-500" colSpan={2}>Redacted — consent withdrawn</td>
                      <td className="p-3 text-slate-500">—</td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">{r.confidence === null ? "—" : r.confidence.toFixed(4)}</td>
                      <td className="p-3">{STATUS_LABEL[r.status]?.en ?? r.status}</td>
                      <td className="p-3 font-mono">{r.demoIdentityId}</td>
                    </>
                  )}
                  <td className="p-3">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="p-3">
                    {!r.redacted && <Link className="font-semibold text-teal-800 underline" href={`/officer/cases/${r.id}`}>Review</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-6">No cases assigned to you.</p>}
        </div>
      </div>
    </main>
  );
}
