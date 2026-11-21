import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { requireVerifiedActor } from "@/lib/auth/server";
import {
  AuthorizationError,
  ROLE_DASHBOARD_COPY,
} from "@/lib/auth/roles";
import type { VerifiedActor } from "@/lib/auth/types";

export const instant = false;

const ROLE_LINKS: Record<string, { href: string; label: string }[]> = {
  citizen: [
    { href: "/citizen/claim", label: "Start / continue my claim" },
    { href: "/citizen/consent", label: "My consent" },
    { href: "/scam-check", label: "Scam & document checker" },
  ],
  helper: [
    { href: "/helper/families", label: "Choose a family to help" },
    { href: "/scam-check", label: "Scam & document checker" },
  ],
  officer: [{ href: "/officer/queue", label: "Open review queue" }],
  admin: [{ href: "/admin/rules", label: "Policy rules" }],
  auditor: [{ href: "/auditor/logs", label: "Audit trace" }],
};

export default async function DashboardPage() {
  await connection();
  let actor: VerifiedActor;
  try {
    actor = await requireVerifiedActor();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(error.statusCode === 401 ? "/login" : "/login?error=account");
    }
    throw error;
  }

  const dashboardCopy = ROLE_DASHBOARD_COPY[actor.role];

  return (
    <main className="flex flex-1 items-start px-5 py-12 sm:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
              Secure demo dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Welcome, {actor.displayName}
            </h1>
          </div>
          <form action={logout}>
            <button
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-8 rounded-3xl border border-teal-200 bg-teal-50 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">Your role</h2>
            <span className="rounded-full bg-teal-800 px-3 py-1 text-sm font-semibold capitalize text-white">
              {actor.role}
            </span>
          </div>
          <p className="mt-4 max-w-3xl leading-7 text-slate-700">
            {dashboardCopy}
          </p>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-950">Your tasks</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {ROLE_LINKS[actor.role].map((l) => (
              <li key={l.href}>
                <Link
                  className="inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
                  href={l.href}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            {ROLE_LINKS[actor.role].length === 0 && (
              <li className="text-slate-600">No screens for this role in Slice B.</li>
            )}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Every claim, payment and officer decision here is SIMULATED. No real money moves.
          </p>
        </section>
      </div>
    </main>
  );
}
