import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
          404 · Not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          This page is unavailable
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          No information was found at this address.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
          href="/"
        >
          Return home
        </Link>
      </section>
    </main>
  );
}
