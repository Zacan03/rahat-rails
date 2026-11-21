import "server-only";

import { getDb } from "@/lib/db/client";

export type SourceHit = {
  id: string;
  sourceType: "official_public" | "simulation_rule";
  label: string;
  title: string;
  url: string | null;
  excerpt: string;
  policyVersion: number;
};

type RawSource = {
  id: string; source_type: "official_public" | "simulation_rule"; label: string; title: string;
  url: string | null; exact_excerpt: string; topic: string;
};

/**
 * Keyword retrieval over curated, sourced snippets stored with the ACTIVE policy version.
 * Official anti-scam info and the invented demo rule are labelled separately and never merged.
 */
export async function searchSources(query: string, opts: { onlyOfficial?: boolean } = {}): Promise<SourceHit[]> {
  const rows = await getDb()<{ version: number; sources_json: RawSource[] }[]>`
    select version, sources_json from public.policy_rules
    where policy_key = 'RELIEF_GRANT_DEMO' and status = 'active'`;
  const row = rows[0];
  if (!row) return [];
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).slice(0, 12);
  const hits = row.sources_json
    .filter((s) => !opts.onlyOfficial || s.source_type === "official_public")
    .map((s) => {
      const hay = `${s.title} ${s.exact_excerpt} ${s.topic}`.toLowerCase();
      return { s, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0 || opts.onlyOfficial)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return hits.map(({ s }) => ({
    id: s.id, sourceType: s.source_type, label: s.label, title: s.title, url: s.url,
    excerpt: s.exact_excerpt, policyVersion: row.version,
  }));
}
