import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { isUuid } from "@/lib/auth/consent";
import { loadAuditorView } from "@/lib/services/audit-view";

export const instant = false;

export default function AuditorLogsPage(props: PageProps<"/auditor/logs">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <AuditorContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

async function AuditorContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const actor = await requirePageActor(["auditor"]);
  const sp = await searchParams;
  const caseId = typeof sp.case === "string" && isUuid(sp.case) ? sp.case : null;
  const { chain, events, traces } = await loadAuditorView(actor, caseId);

  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Auditor trace {caseId && <span className="font-mono text-lg">· case {caseId.slice(0, 8)}</span>}</h1>
        <p className={`rounded-2xl border-2 p-4 font-semibold ${chain.ok ? "border-teal-500 bg-teal-50" : "border-rose-500 bg-rose-50"}`}>
          Hash chain: {chain.ok ? "VALID" : `BROKEN at event #${chain.brokenAtId}`} — {chain.checked} events re-hashed with SHA-256. Tamper-evident for this demo only (a database superuser could still rewrite history).
        </p>
        {caseId && <p><Link className="underline" href="/auditor/logs">Show all cases</Link></p>}

        <section>
          <h2 className="mb-2 text-xl font-semibold">Cases — citizen explanation vs auditor trace</h2>
          <div className="space-y-4">
            {traces.map((c) => {
              const ex = c.explanation as { penalties?: Record<string, unknown>; modelVersion?: string; toolEvents?: unknown[]; reasonCodes?: string[]; expectedLosses?: { expectedWrongApprovalLoss: number; expectedManualDelayLoss: number }; decisionActor?: string };
              return (
                <article key={c.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
                  <div>
                    <h3 className="font-semibold">What the citizen sees</h3>
                    <p className="mt-2">{c.reasonEn ?? "—"}</p>
                    <p className="mt-2" dir="rtl">{c.reasonUr ?? "—"}</p>
                  </div>
                  <div className="text-sm">
                    <h3 className="font-semibold">Technical trace · <Link className="font-mono underline" href={`/auditor/logs?case=${c.id}`}>{c.id.slice(0, 8)}</Link></h3>
                    <p>Status {c.status} · SYNTHETIC DEMO RULE v{c.policyVersion ?? "—"} · confidence {c.confidence?.toFixed(4) ?? "n/a"}</p>
                    <p>Model: {ex.modelVersion ?? "n/a"} · decision actor: {ex.decisionActor ?? "n/a"}{c.overridden ? " · officer override recorded" : ""}</p>
                    {ex.expectedLosses && <p>Expected loss wrong-approval {ex.expectedLosses.expectedWrongApprovalLoss} vs delay {ex.expectedLosses.expectedManualDelayLoss} (20:3)</p>}
                    <p className="mt-2 font-semibold">Factors</p>
                    <p className="font-mono text-xs">{Object.entries(c.factorScores ?? {}).map(([k, v]) => `${k}=${v}`).join("  ")}</p>
                    <p className="mt-1 font-semibold">Hard gates</p>
                    <p className="font-mono text-xs">{Object.entries(c.hardGates ?? {}).map(([k, v]) => `${v ? "✓" : "✗"}${k}`).join("  ")}</p>
                    <p className="mt-1 font-mono text-xs">penalties {JSON.stringify(ex.penalties ?? {})}</p>
                  </div>
                </article>
              );
            })}
            {traces.length === 0 && <p>No cases.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">{caseId ? "Ordered events for this case" : "Latest 100 events"}</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100"><tr><th className="p-2">#</th><th className="p-2">Time (UTC)</th><th className="p-2">Action</th><th className="p-2">Outcome</th><th className="p-2">Actor</th><th className="p-2">Redacted metadata</th><th className="p-2">Hash ← prev</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-slate-200 align-top">
                    <td className="p-2">{e.id}</td>
                    <td className="p-2">{new Date(e.occurredAt).toISOString().slice(0, 19).replace("T", " ")}</td>
                    <td className="p-2 font-semibold">{e.action}</td>
                    <td className={`p-2 ${e.outcome === "DENIED" ? "text-rose-700" : ""}`}>{e.outcome}</td>
                    <td className="p-2">{e.actorType}/{e.actorLabel}</td>
                    <td className="max-w-xs break-words p-2 font-mono">{JSON.stringify(e.metadata)}</td>
                    <td className="p-2 font-mono">{short(e.entryHash)} ← {short(e.previousHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
