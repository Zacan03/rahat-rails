import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requirePageActor } from "@/lib/auth/page";
import { isUuid } from "@/lib/auth/consent";
import { resolveProfileForActor } from "@/lib/services/views";
import { listConsentFor } from "@/lib/services/consent-view";
import { consentToggleAction } from "@/app/citizen/consent/actions";
import { Speak } from "@/components/voice/voice";

export const instant = false;

export default function ConsentPage(props: PageProps<"/citizen/consent">) {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <ConsentContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const SCOPE_TEXT: Record<string, string> = {
  "platform:process": "Process this synthetic claim",
  "identity:verify": "Run the mock identity check",
  "ai:process": "Use automated (deterministic) checks",
  "officer:review": "Let an assigned officer review the case",
  "payment:simulate": "Create a SIMULATED payment reference",
  "profile:read": "Helper may view the profile",
  "profile:correct": "Helper may correct details",
  "case:read": "Helper may view the case",
  "case:write": "Helper may edit/submit the case",
};

async function ConsentContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const actor = await requirePageActor(["citizen", "helper"]);
  const sp = await searchParams;
  const pid = typeof sp.profile === "string" && isUuid(sp.profile) ? sp.profile : null;
  const profile = await resolveProfileForActor(actor, pid);
  const flash = typeof sp.withdraw === "string" ? `withdraw:${sp.withdraw}` : typeof sp.grant === "string" ? `grant:${sp.grant}` : null;

  if (!profile) {
    return (
      <Shell>
        <p className="rounded-2xl bg-white p-6">No profile selected. {actor.role === "helper" && <Link className="underline" href="/helper/families">Choose a family</Link>}</p>
      </Shell>
    );
  }
  const rows = await listConsentFor(actor, profile.id);
  const live = rows?.filter((r) => !r.withdrawnAt) ?? [];
  const history = rows?.filter((r) => r.withdrawnAt) ?? [];
  const intro = "You decide who can see this claim. You can take your permission back at any time, and it stops immediately for helpers, officers and payment. Anything already seen cannot be un-seen.";

  return (
    <Shell>
      <div className="rounded-2xl border-2 border-teal-700 bg-teal-50 px-5 py-3" role="status">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-900">Active synthetic citizen</p>
        <p className="text-lg font-semibold">{profile.demoIdentityId} — {profile.displayName}</p>
      </div>
      <p className="mt-4 leading-7">{intro} <Speak text={intro} urText="آپ فیصلہ کرتے ہیں کہ کون اس کلیم کو دیکھ سکتا ہے۔ آپ کسی بھی وقت اجازت واپس لے سکتے ہیں اور یہ فوراً نافذ ہو جاتی ہے۔" /></p>
      {flash && (
        <p role="status" className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm">
          {flash.endsWith(":ok") ? (flash.startsWith("withdraw") ? "Consent withdrawn. Access is blocked now." : "Permission recorded.") : `Action blocked (${flash}).`}
        </p>
      )}

      {rows === null ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
          <p>No active permission for this family, so details are hidden.</p>
          <GrantForm profileId={profile.id} helper={actor.role === "helper"} />
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Active permissions</h2>
            {live.length === 0 ? <p className="mt-2">None. Nobody can process or see this claim.</p> : (
              <ul className="mt-3 space-y-3">
                {live.map((r) => (
                  <li key={r.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="font-semibold">{r.kind === "platform" ? "Platform / officer / payment" : "Helper access"} · {r.evidenceMode}</p>
                    <ul className="list-disc pl-5">{r.scopes.map((s) => <li key={s}>{SCOPE_TEXT[s] ?? s}</li>)}</ul>
                    <p className="text-xs text-slate-500">Granted {new Date(r.grantedAt).toISOString().slice(0, 16).replace("T", " ")}</p>
                  </li>
                ))}
              </ul>
            )}
            {live.length > 0 ? (
              <form action={consentToggleAction} className="mt-4">
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="op" value="withdraw" />
                <button className="min-h-14 w-full rounded-xl bg-rose-700 px-6 text-lg font-semibold text-white sm:w-auto" type="submit">
                  ⛔ Withdraw ALL permission now / اجازت واپس لیں
                </button>
              </form>
            ) : <GrantForm profileId={profile.id} helper={actor.role === "helper"} />}
          </section>
          {history.length > 0 && (
            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Withdrawn</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {history.map((r) => <li key={r.id}>{r.kind} — withdrawn {new Date(r.withdrawnAt!).toISOString().slice(0, 16).replace("T", " ")}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function GrantForm({ profileId, helper }: { profileId: string; helper: boolean }) {
  return (
    <form action={consentToggleAction} className="mt-4 space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="op" value="grant" />
      <label className="flex min-h-12 items-start gap-3 font-semibold">
        <input type="checkbox" name="witnessed" className="mt-1 size-6" required />
        {helper ? "The citizen is present and has said yes (simulated witnessed assent)." : "I agree (simulated demo consent)."}
      </label>
      <button className="min-h-12 rounded-xl bg-teal-800 px-6 font-semibold text-white" type="submit">Share permission</button>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 px-5 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link className="text-sm font-semibold text-teal-800" href="/dashboard">← Dashboard</Link>
        <h1 className="mb-4 mt-3 text-3xl font-semibold tracking-tight">My consent / میری اجازت</h1>
        {children}
      </div>
    </main>
  );
}
