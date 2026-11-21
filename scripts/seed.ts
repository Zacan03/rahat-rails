/**
 * Seeds SYNTHETIC demo data only: 5 role accounts, policy v1 (active) + v2 (draft),
 * official anti-scam excerpts, and 40 fictional families DEMO-WD-001..040.
 * Run: npm run seed   (requires DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local)
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import demoRoles from "../tests/fixtures/demo-roles.json";
import { FAMILY_COUNT, demoId, recordFor } from "../lib/rails/fixtures";
import { normalizeName } from "../lib/domain/identity-match";
import { PolicyRuleSchema } from "../lib/domain/rules";

loadEnvConfig(process.cwd());

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_USER_SEED !== "true") {
  throw new Error("Refusing to seed in production without ALLOW_DEMO_USER_SEED=true.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.DEMO_USER_PASSWORD || "DemoPass123!";
if (!url || !serviceKey || !databaseUrl) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local.");
}

const POLICY_KEY = "RELIEF_GRANT_DEMO";
const RETRIEVED_AT = new Date().toISOString();

const OFFICIAL_SOURCES = [
  {
    id: "BISP-8171-OFFICIAL-1",
    source_type: "official_public",
    label: "OFFICIAL PUBLIC ANTI-SCAM INFO",
    publisher: "Benazir Income Support Programme (public news page)",
    title: "8171 is the official number; do not trust any other number",
    url: "https://www.bisp.gov.pk/NewsDetail/Njk4ZDI0MTAtYzdiMy00MDMwLTljNTItZjI3OWM2MGQ4OWYz",
    retrieved_at: RETRIEVED_AT,
    topic: "scam-prevention",
    exact_excerpt:
      "8171 IS THE OFFICIAL NUMBER OF THE BENAZIR INCOME SUPPORT PROGRAM; DON'T TRUST ANY OTHER NUMBER",
    note: "Informational only. Does not certify this fictional demo relief program.",
  },
  {
    id: "BISP-8171-OFFICIAL-2",
    source_type: "official_public",
    label: "OFFICIAL PUBLIC ANTI-SCAM INFO",
    publisher: "Benazir Income Support Programme (public news page)",
    title: "No survey fee; message from any other number is fraud",
    url: "https://www.bisp.gov.pk/NewsDetail/M2MzZDg0ZjctYjBkMS00YzQ1LTkwMjQtMmVhZWFiZDgyZmI0",
    retrieved_at: RETRIEVED_AT,
    topic: "scam-prevention",
    exact_excerpt:
      "THERE IS NO FEE FOR SURVEY IN BENAZIR INCOME SUPPORT PROGRAMME, 8171 IS THE ONLY OFFICIAL BISP NUMBER, MESSAGE FROM ANY OTHER NUMBER IS FRAUD, DO REPORT",
    note: "Informational only. Does not certify this fictional demo relief program.",
  },
];

const v1Rules = {
  minimum_age: 18,
  widow_required: true,
  max_household_income_pkr: 35000,
  max_prior_mock_grants: 0,
  allowed_districts: ["KARACHI_DEMO"],
  required_proofs: ["DEMO_ID", "WIDOWHOOD_ATTESTATION"],
  grant_amount_pkr: 12000,
  priority_if_dependents_at_least: 2,
  confidence_thresholds: { approve: 0.85, ask_proof: 0.6 },
  loss_wrong_approval: 20,
  loss_wait_for_review: 3,
};
const v2Rules = { ...v1Rules, max_household_income_pkr: 40000, grant_amount_pkr: 15000 };
PolicyRuleSchema.parse(v1Rules);
PolicyRuleSchema.parse(v2Rules);

const simSource = (v: number) => ({
  id: `SIM-RULE-V${v}`,
  source_type: "simulation_rule",
  label: `SYNTHETIC DEMO RULE v${v}`,
  publisher: "Rahat Rails prototype (invented for simulation)",
  title: `Synthetic relief eligibility rule v${v}`,
  url: null,
  retrieved_at: RETRIEVED_AT,
  topic: "eligibility",
  exact_excerpt: "Invented demo rule. Not a real BISP, NADRA or government policy.",
});

async function main() {
  const sql = postgres(databaseUrl!, { ssl: "require", max: 2, connect_timeout: 20 });
  const admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Auth users + public.users
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error("Cannot list auth users.");
  const byEmail = new Map(listed.users.map((u) => [u.email?.toLowerCase(), u]));
  const ids: Record<string, string> = {};
  for (const f of demoRoles) {
    let user = byEmail.get(f.email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email: f.email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Cannot create ${f.role} account.`);
      user = data.user;
    } else {
      await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    }
    ids[f.role] = user.id;
    await sql`
      insert into public.users (id, display_name, role, active) values (${user.id}::uuid, ${f.displayName}, ${f.role}::public.app_role, true)
      on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, active = true`;
  }

  // 2. Policies, profiles, one audit event — in a single transaction
  await sql.begin(async (tx) => {
    const sources = (v: number) => [...OFFICIAL_SOURCES, simSource(v)];
    const [v1] = await tx`
      insert into public.policy_rules (policy_key, version, status, title, rules_json, sources_json, created_by_user_id, published_by_user_id, published_at)
      values (${POLICY_KEY}, 1, 'active', 'Synthetic relief rule v1', ${JSON.stringify(v1Rules)}::text::jsonb, ${JSON.stringify(sources(1))}::text::jsonb,
              ${ids.admin}::uuid, ${ids.admin}::uuid, now())
      on conflict (policy_key, version) do nothing returning id`;
    const [v2] = await tx`
      insert into public.policy_rules (policy_key, version, status, title, rules_json, sources_json, created_by_user_id)
      values (${POLICY_KEY}, 2, 'draft', 'Synthetic relief rule v2 (draft)', ${JSON.stringify(v2Rules)}::text::jsonb, ${JSON.stringify(sources(2))}::text::jsonb, ${ids.admin}::uuid)
      on conflict (policy_key, version) do nothing returning id`;

    let created = 0;
    for (let n = 1; n <= FAMILY_COUNT; n++) {
      const rec = recordFor(n);
      const r = await tx`
        insert into public.citizen_profiles
          (created_by_user_id, demo_identity_id, display_name, name_search_key, name_variants, preferred_language,
           district, age_years, is_widow, household_income_pkr, household_size, low_literacy)
        values (${ids.helper}::uuid, ${demoId(n)}, ${rec.storedName}, ${normalizeName(rec.storedName)},
                ${JSON.stringify(rec.nameVariants)}::text::jsonb, 'ur', ${rec.district}, ${rec.ageYears}, ${rec.isWidow},
                ${rec.householdIncomePkr}, ${rec.householdSize}, true)
        on conflict (demo_identity_id) do nothing returning id`;
      created += r.length;
    }
    // The demo citizen account owns DEMO-WD-001 (helper may assist the same family).
    await tx`update public.citizen_profiles set user_id = ${ids.citizen}::uuid
             where demo_identity_id = ${demoId(1)} and user_id is null
               and not exists (select 1 from public.citizen_profiles where user_id = ${ids.citizen}::uuid)`;

    if (v1 || v2 || created > 0) {
      await tx`select private.append_audit(${randomUUID()}::uuid, 'system', null, 'seed-script', 'SEED_APPLIED', 'system', null, 'SUCCESS',
               ${JSON.stringify({ count: created })}::text::jsonb)`;
    }
    console.log(`Policies: v1 ${v1 ? "created" : "exists"}, v2 ${v2 ? "created" : "exists"}. Families created: ${created}.`);
  });

  const [{ n }] = await sql`select count(*)::int as n from public.citizen_profiles`;
  console.log(`Seed complete: 5 role accounts, ${n} synthetic families. Passwords were not printed.`);
  await sql.end();
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
