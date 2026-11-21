/** Name normalisation is for CANDIDATE RETRIEVAL ONLY — never for establishing identity. */
export function normalizeName(name: string): string {
  const t = name.toLowerCase().trim().replace(/\s+/g, " ");
  return t.replace(/^(muhammad|mohammad|muhammed|mohammed|mohamed|muhamad)\b/, "muhammad");
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(normalizeName(a));
  const B = trigrams(normalizeName(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export type NameMatch = { similarity: number; exact: boolean; aliasOnly: boolean };

export function compareNames(claimed: string, stored: string, variants: string[]): NameMatch {
  const flat = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = flat(claimed) === flat(stored);
  const similarity = Math.max(...[stored, ...variants].map((n) => trigramSimilarity(claimed, n)));
  return { similarity, exact, aliasOnly: !exact && similarity >= 0.6 };
}

/** candidate similarity = 0.55 name + 0.30 DOB + 0.15 household (SPEC §4). */
export function candidateScore(nameSim: number, dobMatch: boolean, householdMatch: boolean) {
  return (
    Math.round(
      (0.55 * nameSim + 0.3 * (dobMatch ? 1 : 0) + 0.15 * (householdMatch ? 1 : 0)) * 10000,
    ) / 10000
  );
}
