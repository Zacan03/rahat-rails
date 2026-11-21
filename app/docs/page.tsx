import Link from "next/link";

const authenticationSchemes = [
  {
    name: "bearerAuth",
    detail: "Supabase JWT in the Authorization: Bearer header.",
  },
  {
    name: "partnerApiKey",
    detail: "Partner key in the X-API-Key header; private citizen endpoints are not exposed.",
  },
];

export default function DocsPage() {
  return (
    <main className="flex flex-1 items-start px-5 py-12 sm:px-10">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
          OpenAPI 3.1 · stub
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          API documentation
        </h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-600">
          This contract stub documents the authentication schemes and the
          verified-session smoke endpoint only. Future case and partner routes
          are not implemented in Slice A.
        </p>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-950">
            Authentication schemes
          </h2>
          <dl className="mt-5 space-y-5">
            {authenticationSchemes.map((scheme) => (
              <div key={scheme.name}>
                <dt className="font-mono text-sm font-semibold text-teal-900">
                  {scheme.name}
                </dt>
                <dd className="mt-1 text-sm leading-6 text-slate-600">
                  {scheme.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-950">
            Available document
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            The OpenAPI document contains synthetic examples only and does not
            describe any live government or payment integration.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-xl bg-teal-800 px-4 font-semibold text-white hover:bg-teal-900"
              href="/api/openapi"
            >
              View OpenAPI JSON
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold text-slate-800 hover:bg-slate-50"
              href="/openapi.yaml"
            >
              View YAML source
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
