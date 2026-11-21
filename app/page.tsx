import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center px-6 py-16 sm:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Rahat Rails · Slice A
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-6xl">
            A safer starting point for a relief workflow.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            This prototype foundation provides verified sign-in and
            server-checked roles for synthetic demo accounts. It is not a
            government service and does not process claims or payments.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-800 px-6 font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              href="/login"
            >
              Sign in to the demo
            </Link>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              href="/docs"
            >
              API documentation
            </Link>
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Foundation only
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Five server-managed roles
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-3">
            {["Citizen", "Helper", "Officer", "Admin", "Auditor"].map((role) => (
              <li
                className="rounded-xl bg-slate-50 px-4 py-3 font-medium"
                key={role}
              >
                {role}
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
            Roles are loaded from the active database user record after
            Supabase verifies the session. A client-supplied role is never
            accepted as authority.
          </p>
        </aside>
      </div>
    </main>
  );
}
