"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error.digest) {
      console.error("Rahat Rails route error", { digest: error.digest });
    }
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-950">
          Something went wrong
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          The page could not be loaded. Please try again.
        </p>
        <button
          className="mt-6 min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
