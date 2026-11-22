import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center px-6 py-16 sm:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Rahat Rails · Synthetic relief workflow
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-6xl">
            Relief help that is guided, consented and easier to understand.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Rahat Rails helps low-literacy widows and community helpers move
            through one structured synthetic relief claim: witnessed consent,
            guided evidence, mock checks, plain-language decisions and a complete
            audit trail. It is not a government service and never processes real
            payments.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-800 px-6 font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              href="/login"
            >
              Sign in to the demo
            </Link>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-6 font-semibold text-slate-950 transition hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
              href="/scam-check"
            >
              Scam SMS &amp; ID Checker
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
            Complete demo overview
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            One safe, auditable journey
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            {[
              ["Consent", "Choose a synthetic family and grant or withdraw access."],
              ["Guided claim", "Save each step and submit only when the citizen is ready."],
              ["Mock evidence", "Check synthetic identity, documents and scam signals."],
              ["Clear decision", "Approve, request proof or send a case for officer review."],
            ].map(([title, detail]) => (
              <li
                className="rounded-xl bg-slate-50 px-4 py-3"
                key={title}
              >
                <span className="font-semibold text-slate-900">{title}</span>
                <span className="mt-1 block leading-5 text-slate-600">{detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
            Citizen, helper, officer, admin and auditor access is checked
            server-side. Live consent, version-pinned rules and append-only
            audit records protect the workflow.
          </p>
        </aside>
      </div>
    </main>
  );
}
