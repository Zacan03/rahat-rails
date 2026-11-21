"use client";

import { PrototypeBanner } from "@/components/prototype-banner";
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
        <PrototypeBanner />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-3xl font-semibold">Application unavailable</h1>
            <p className="mt-3 leading-7 text-slate-600">
              This prototype could not load. Please try again.
            </p>
            <button
              className="mt-6 min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
