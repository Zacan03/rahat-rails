import { getDb } from "@/lib/db/client";
import { checkInternalKey, mockError, mockJson } from "@/lib/rails/internal-auth";


/** MOCK policy registry: synthetic policy versions + labelled sources. Contains no citizen data. */
export async function GET(request: Request) {
  const gate = checkInternalKey(request);
  if (gate !== "ok") return mockError(gate === "unavailable" ? 503 : 401, gate.toUpperCase());

  const rows = await getDb()<{ id: string; version: number; status: string; title: string; rules_json: unknown; sources_json: unknown }[]>`
    select id, version, status, title, rules_json, sources_json from public.policy_rules
    where policy_key = 'RELIEF_GRANT_DEMO' order by version`;
  return mockJson({
    notice: "SYNTHETIC DEMO RULES - NOT A REAL GOVERNMENT POLICY",
    policies: rows.map((r) => ({
      id: r.id, version: r.version, status: r.status, title: r.title, rules: r.rules_json, sources: r.sources_json,
    })),
  });
}
