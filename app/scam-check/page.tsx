import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { scamMetrics } from "@/lib/services/scam";
import { ScamChecker } from "@/components/scam/scam-checker";

export const instant = false;

export default function ScamCheckPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <ScamContent />
    </Suspense>
  );
}

async function ScamContent() {
  await connection();
  await requirePageActor(["citizen", "helper", "officer"]);
  const metrics = await scamMetrics();
  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="mb-2 mt-3 text-3xl font-semibold tracking-tight">Scam &amp; fake document checker</h1>
        <p className="mb-6 text-sm text-slate-600">
          For shopkeepers, citizens and helpers. Results are uncertainty labels, never proof. This tool cannot verify who really sent a message.
        </p>
        <ScamChecker metrics={metrics} />
      </div>
    </main>
  );
}
