import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/page";
import { isUuid } from "@/lib/auth/consent";
import { getOrCreateDraft } from "@/lib/services/claims";
import { loadCaseForActor, resolveProfileForActor } from "@/lib/services/views";
import { claimTemplateFor } from "@/lib/rails/fixtures";
import { ClaimWizard, type Answers } from "@/components/claim/claim-wizard";
import { grantConsentAction, withdrawConsentAction } from "@/app/citizen/claim/actions";

export const instant = false;

export default function ClaimPage(props: PageProps<"/citizen/claim">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <ClaimContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ClaimContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const actor = await requirePageActor(["citizen", "helper"]);
  const sp = await searchParams;
  const profileParam = typeof sp.profile === "string" && isUuid(sp.profile) ? sp.profile : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const profile = await resolveProfileForActor(actor, profileParam);
  if (!profile) {
    return (
      <Shell>
        <p className="rounded-2xl bg-white p-6">
          {actor.role === "helper" ? (
            <>No family selected. <Link className="font-semibold text-teal-800 underline" href="/helper/families">Choose a family</Link>.</>
          ) : (
            "No synthetic profile is linked to this demo account."
          )}
        </p>
      </Shell>
    );
  }

  const consentOk = profile.consent.platform && (actor.role === "citizen" || profile.consent.helper);
  const banner = (
    <div className="rounded-2xl border-2 border-teal-700 bg-teal-50 px-5 py-3" role="status">
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-900">Active synthetic citizen</p>
      <p className="text-lg font-semibold">{profile.demoIdentityId} — {profile.displayName}</p>
      {actor.role === "helper" && (
        <Link className="text-sm font-semibold text-teal-900 underline" href="/helper/families">Finish with family</Link>
      )}
    </div>
  );

  if (!consentOk) {
    return (
      <Shell>
        {banner}
        <ErrorNote code={error} />
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Permission needed / اجازت درکار ہے</h2>
          <p className="mt-3 leading-7 text-slate-700">
            Selecting a family is not permission. To continue, the citizen must agree (in this demo, a witnessed tap) to: platform
            processing of this synthetic claim, mock identity checks, deterministic scoring, officer review, and a simulated payment
            reference. {actor.role === "helper" && "I am recording the citizen's permission for me to help with this claim only. "}
            Permission can be withdrawn at any time and takes effect immediately; access already granted cannot be un-seen.
          </p>
          <p className="mt-2 leading-7 text-slate-700" dir="rtl">
            آپ کی اجازت کے بغیر کوئی کارروائی نہیں ہوگی۔ آپ کسی بھی وقت اجازت واپس لے سکتے ہیں۔
          </p>
          <form action={grantConsentAction} className="mt-5 space-y-4">
            <input type="hidden" name="profileId" value={profile.id} />
            <label className="flex min-h-12 items-start gap-3 font-semibold">
              <input type="checkbox" name="witnessed" className="mt-1 size-6" required />
              {actor.role === "helper"
                ? "The citizen is present and has said yes (simulated witnessed assent)."
                : "I agree (simulated demo consent)."}
            </label>
            <button className="min-h-12 rounded-xl bg-teal-800 px-6 font-semibold text-white" type="submit">
              Record permission
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  const caseId = await getOrCreateDraft(actor, profile.id);
  const view = await loadCaseForActor(actor, caseId);
  if (view.status !== "DRAFT" && view.status !== "MORE_PROOF") redirect(`/citizen/cases/${caseId}`);

  const initial = view.answers as unknown as Answers;
  const tpl = profile.prefillIndex ? (claimTemplateFor(profile.prefillIndex) as Answers) : null;

  return (
    <Shell>
      {banner}
      <ErrorNote code={error} />
      {view.status === "MORE_PROOF" && view.requestedProof.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">More proof requested</p>
          <ul className="list-disc pl-5">{view.requestedProof.map((r) => <li key={r.code}>{r.text}</li>)}</ul>
        </div>
      )}
      <div className="mt-6">
        <ClaimWizard key={profile.id} caseId={caseId} initial={initial} template={tpl} />
      </div>
      <form action={withdrawConsentAction} className="mt-6">
        <input type="hidden" name="profileId" value={profile.id} />
        <button className="min-h-11 rounded-xl border border-rose-300 bg-white px-5 font-semibold text-rose-800" type="submit">
          Withdraw consent now / اجازت واپس لیں
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="mb-4 mt-3 text-3xl font-semibold tracking-tight">Relief claim (simulated)</h1>
        {children}
      </div>
    </main>
  );
}

function ErrorNote({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {code === "ACKNOWLEDGEMENT_REQUIRED" ? "Please tick the acknowledgement." : `Action blocked (${code}).`}
    </p>
  );
}
