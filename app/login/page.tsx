import { Suspense } from "react";
import Link from "next/link";
import { demoLogin, login } from "@/app/login/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<LoginContent />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { error } = searchParams ? await searchParams : {};

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-14">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <Link
          className="text-sm font-semibold text-teal-800 hover:text-teal-950"
          href="/"
        >
          ← Rahat Rails
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-950">
          Sign in to the demo
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use a provisioned synthetic <code>.test</code> account. Do not enter
          real citizen details or personal contact information.
        </p>

        {error && (
          <p
            aria-live="polite"
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            role="alert"
          >
            {error === "account" || error === "demo-account"
              ? "The selected demo account has no active role assignment. Check that the demo seed ran successfully."
              : error === "demo-login"
                ? "Could not sign in to that demo account. Confirm it exists in Supabase Auth and that DEMO_USER_PASSWORD matches the password used to seed it (or use the DemoPass123! fallback)."
                : error === "demo-role"
                  ? "That demo role is not available. Choose one of the listed roles and try again."
                  : "Sign-in failed. Check the synthetic demo credentials and try again."}
          </p>
        )}

        <form action={login} className="mt-7 space-y-5">
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-slate-800"
              htmlFor="email"
            >
              Demo email
            </label>
            <input
              autoComplete="username"
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="email"
              name="email"
              placeholder="role@rahat-rails.test"
              required
              type="email"
            />
          </div>
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-slate-800"
              htmlFor="password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>
          <button
            className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold text-slate-800">
            One-click synthetic demo login
          </h2>
          <form action={demoLogin} className="mt-3 grid grid-cols-2 gap-3">
            {(["citizen", "helper", "officer", "admin", "auditor"] as const).map((role) => (
              <button
                key={role}
                name="role"
                value={role}
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold capitalize text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                type="submit"
              >
                {role}
              </button>
            ))}
          </form>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Synthetic accounts only. No real CNIC, phone number, bank detail, or
          money is used anywhere in this prototype.
        </p>
      </section>
    </main>
  );
}
