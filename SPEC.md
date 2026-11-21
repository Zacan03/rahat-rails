# SPEC.md — Rahat Rails | Coder's Cup 2026

> **PROTOTYPE ONLY — SIMULATED RELIEF WORKFLOW. NOT A GOVERNMENT SERVICE. NO REAL CNICs, BENEFICIARIES, PAYMENTS, OR APPLICATIONS.**
>
> Hackathon: **The Last Mile: AI on Public Rails**, FAST-NUCES Karachi. Delivery window: **44 engineering hours** remaining. This is the build contract, not a wishlist.

## 0. One mission, one finished vertical slice

**Locked mission:** "We help low-literacy widows and community helpers verify and claim emergency relief grants even though they cannot read complex forms, have weak internet, receive fake relief SMS scams, and have inconsistent spelling/NADRA records."

**Product:** **Rahat Rails** — one multi-tenant-ready, role-based SaaS application with separate citizen, helper, officer, admin, and auditor experiences. The **shopkeeper** uses the restricted scam-check experience with a standard signed-in `citizen`-role account **without requiring a widow profile**; the persona is not a sixth privileged role. It is **not a conversational chatbot**. Voice and AI are embedded in a guided workflow; the source of truth is the case database and deterministic decision engine.

**Single task definition:** A synthetic widow begins (directly or assisted), grants granular consent, creates one relief case, undergoes mock NADRA identity resolution and mock document/SMS checks, receives a deterministic decision (`AUTO_APPROVED`, `MORE_PROOF`, or `OFFICER_REVIEW`), and either gets a **mock** Raast disbursement reference or a human review with reasons. Case timeline, audit trace, and consent withdrawal work end to end.

### Definition of done (all are required)

1. At least **three distinct signed-in roles** work end to end: `citizen`, `helper`, `officer`. `admin` and `auditor` have functional read/edit screens too.
2. A helper can search/switch among **40 synthetic families** on one shared device without leaking the previous citizen's data, and each family has its **own consent**.
3. An Urdu-first, icon-led guided claim takes at most six clear steps: choose citizen → consent → voice/form answers → identity/docs → review → decision.
4. Three deterministic test cases produce three branches: `0.92` auto-approval; `0.73` further proof; `0.44` officer handoff with literal **"I am not sure"** and a case-note summary.
5. The `0.92` case, **only if all hard gates pass**, generates an **idempotent simulated payment** reference; no real money moves.
6. Officer can review a sorted queue, see evidence and reasons **only while consent permits**, approve/reject/request proof, and close/escalate cases.
7. Admin publishes policy version 2 **without redeploy**. An older case remains linked to version 1.
8. Withdrawing consent immediately blocks helper/AI/officer access to that profile and its evidence across API, UI, tool calls, queued workers, and freshly reopened sessions; an authorized citizen may still see/correct their own information. Audit retains *redacted metadata*.
9. Every authenticated read, case change, AI/model invocation, tool call, mock payment and sensitive access denial is auditable. Each mutation and its audit event commit in **one Postgres transaction**.
10. Public OpenAPI 3.1 JSON and Swagger UI document API-key-protected partner endpoints plus bearer-token app endpoints; at least one API-key demo call succeeds and a revoked/invalid key fails.
11. README, deployed URL, GitHub repository, 2–3 minute demo video, reproducible SQL migrations, and automated acceptance tests exist.

**Non-goals:** Actual government registration; real NADRA/Raast integrations; real CNICs; real eligibility certification; real transfers; general-purpose AI advisor; cross-bank ecosystem; production-grade biometric verification. Clearly mark all policy, identity, and payout outputs as synthetic.

## 1. Architecture and the fastest stack

| Layer | Lock for 44 hours | Reason/implementation |
|---|---|---|
| Web + API | Next.js App Router, TypeScript, Route Handlers (`app/api/**/route.ts`), Node runtime | One deployable codebase; Server Components for dashboards; no separate backend |
| UI | Tailwind CSS + shadcn/ui, lucide-react, Urdu/English toggle, responsive mobile-first | Legible cards, large actions, low-literacy voice icons; fast building |
| Authentication | Supabase Auth (JWT via `@supabase/ssr`); server verify using `getClaims()` or `getUser()` | Never trust UI role/session claims; fetch role from `public.users` on server |
| Authorization | Server `requireRole()` + `requireConsent()` **on every read/write/tool**; Postgres RLS as defense-in-depth | User roles cannot be self-assigned; service credential never shipped to browser |
| DB | Supabase PostgreSQL + SQL migrations; `postgres` npm driver for transaction-bound, server-only mutations | Real atomic case + audit transactions, versioned rules, immediate revocation checks |
| Validation | Zod for HTTP input and AI output (JSON Schema generated where supported) | Validate all trust boundaries; no free-form LLM decision execution |
| AI | OpenAI Responses API **or** Claude Messages API, one provider wired behind `AIProvider`; structured JSON output | Use whichever key works; deterministic fallback must remain functional |
| AI retrieval | Postgres full-text/keyword retrieval over curated sourced policy snippets | Avoid vector DB during hackathon; citations displayed with title, URL, rule version |
| Mock rails | Next.js server modules with clearly defined interfaces: `IdentityRail`, `PaymentRail`, `DataRail` | No external identity/payment calls, no real money |
| REST docs | OpenAPI 3.1 checked-in at `public/openapi.yaml`; `/api/openapi` and `/docs` Swagger UI | Public reproducible contract and one-page judges' test |
| Notifications | In-app case timeline first; optional server-side simulated SMS outbox (never send) | Third extra feature if background jobs deprioritized |
| Jobs | Optional Vercel Cron or protected internal job endpoint for retrying *mock* disbursements | Must re-check consent and case state before each attempt |
| Testing/deploy | Vitest + Playwright smoke tests; Vercel + hosted Supabase | Focus on demonstrable integration, not infrastructure |

**Chosen extra features (4):** (1) versioned admin rule editor, (2) priority/confidence officer queue, (3) low-bandwidth saved-progress mode, (4) in-app notifications/case timeline. Background jobs are an optional fifth and never required for the golden path.

**Chosen AI features (at least 6):** (a) sourced RAG; (b) bounded agent with audited tool calling to mock rails; (c) classification/routing with deterministic confidence; (d) structured JSON output; (e) guardrails + human approval; (f) dual explainability; plus voice and basic vision/OCR as time permits. Do not claim production-grade tamper detection or real voice accuracy.

### Trust boundaries

```text
Browser (untrusted; online or intermittent)
  -> Next.js authenticated Route Handler / Server Action
     -> verify Supabase JWT; load role from users; verify profile-specific consent
     -> Zod validation + idempotency guard
     -> server-only transaction (Postgres) -> case + audit event together
     -> AI orchestration (no DB write privileges)
        -> allowlisted tools: mockIdentityLookup, mockPayment, mockPolicyLookup,
           mockDuplicateSearch, classifyScam, inspectDemoDocument
        -> each tool rechecks consent/case, is bounded, and writes audit metadata
     -> sanitized role-scoped response

Supabase Auth = authentication, public.users = roles, public.consent_records = authorization
Postgres policy_rules = decision source of truth, NOT the LLM.
```

**Security note:** Supabase `service_role` and direct DB connections can bypass RLS. They must exist **server-side only** and are NOT an excuse to bypass app-level role and live-consent checks. Never use `getSession().user` alone as authorization proof. No public client table writes. Public API keys are application-generated, hashed, and scoped; they are not Supabase service keys.

### Repo structure

```text
app/
  layout.tsx                         # universal, persistent prototype banner
  (public)/page.tsx                   # overview, languages, demo notice
  (auth)/login/page.tsx
  (app)/dashboard/page.tsx
  (app)/citizen/claim/page.tsx        # guided steps, speech + saved progress
  (app)/citizen/cases/[caseId]/page.tsx
  (app)/helper/families/page.tsx      # 40-family switcher
  (app)/helper/families/[profileId]/page.tsx
  (app)/helper/cases/new/page.tsx
  (app)/officer/queue/page.tsx
  (app)/officer/cases/[caseId]/page.tsx
  (app)/admin/rules/page.tsx
  (app)/admin/rules/[ruleId]/page.tsx
  (app)/auditor/cases/[caseId]/page.tsx
  (app)/scam-check/page.tsx
  (app)/consent/[profileId]/page.tsx
  (public)/docs/page.tsx
  api/v1/**/route.ts
  api/public/**/route.ts
  api/mock/**/route.ts                # internal-only; reject direct browser callers
  api/openapi/route.ts
components/{banner,claim,helper,officer,scam,voice,ui}/
lib/
  auth/{server,roles,consent}.ts
  db/{client,transactions,audit}.ts
  domain/{case-machine,confidence,rules,identity-match}.ts
  ai/{provider,schemas,rag,agent,guardrails}.ts
  rails/{identity,payment,data}.ts
  api/{errors,auth-key,response}.ts
  offline/{drafts,sync}.ts
  i18n/{en,ur}.ts
supabase/migrations/202611200001_init.sql
supabase/seed.sql
public/{openapi.yaml,icons,voice-demo}/
tests/{confidence,consent,rules,rbac,audit,identity,scam,e2e}/
scripts/{seed-demo.ts,verify-demo.ts}
README.md
SPEC.md
CLAUDE.md
.env.example
```

## 2. Database migration — exact Postgres SQL

Create **`supabase/migrations/202611200001_init.sql`** with the complete SQL below. It defines seven requested domain tables plus one supporting `api_keys` table (necessary for real API-key authentication). All demo identity IDs are opaque synthetic labels; **never store a CNIC-shaped 13-digit value**.

```sql
begin;

create schema if not exists private;
-- PostgreSQL 13+ has built-in gen_random_uuid() and sha256(bytea);
-- no extension installation or external crypto schema is required.

create type public.app_role as enum
  ('citizen','helper','officer','admin','auditor');
create type public.case_status as enum
  ('DRAFT','SUBMITTED','CHECKING','MORE_PROOF','OFFICER_REVIEW',
   'AUTO_APPROVED','OFFICER_APPROVED','REJECTED','MOCK_PAID',
   'ESCALATED','CLOSED','CONSENT_WITHDRAWN');
create type public.policy_status as enum ('draft','active','retired');
create type public.scam_verdict as enum ('LIKELY_SCAM','UNCERTAIN','LIKELY_SAFE');

-- 1. Signed-in principals; Supabase auth.users owns credentials and JWTs.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role public.app_role not null default 'citizen',
  active boolean not null default true,
  preferred_language text not null default 'ur' check (preferred_language in ('ur','en')),
  created_at timestamptz not null default now()
);

-- 2. An assisted citizen need not have a login. Each family is isolated.
create table public.citizen_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  created_by_user_id uuid not null references public.users(id),
  demo_identity_id text not null unique
    check (demo_identity_id ~ '^DEMO-[A-Z0-9-]{3,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  name_search_key text not null,
  name_variants jsonb not null default '[]'::jsonb
    check (jsonb_typeof(name_variants) = 'array'),
  preferred_language text not null default 'ur' check (preferred_language in ('ur','en')),
  district text not null default 'KARACHI_DEMO',
  age_years int check (age_years between 18 and 110),
  is_widow boolean,
  household_income_pkr integer check (household_income_pkr between 0 and 10000000),
  household_size int check (household_size between 1 and 40),
  low_literacy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index citizen_profiles_creator_idx
  on public.citizen_profiles(created_by_user_id);
create index citizen_profiles_name_idx
  on public.citizen_profiles(name_search_key);

-- 3. Active grant = withdrawn_at IS NULL. A platform grant has NULL grantee.
-- The helper grant is independent for EACH citizen.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  citizen_profile_id uuid not null references public.citizen_profiles(id),
  grantee_user_id uuid references public.users(id),
  granted_by_user_id uuid not null references public.users(id),
  purpose text not null default 'DEMO_RELIEF_CLAIM',
  scopes text[] not null check (cardinality(scopes) > 0),
  evidence_mode text not null check
    (evidence_mode in ('citizen_tap','assisted_voice_demo','assisted_tap_demo')),
  evidence_reference text not null check (evidence_reference like 'DEMO:%'),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by_user_id uuid references public.users(id),
  constraint consent_withdraw_fields check
    ((withdrawn_at is null and withdrawn_by_user_id is null) or
     (withdrawn_at is not null and withdrawn_by_user_id is not null)),
  constraint consent_dates check
    (withdrawn_at is null or withdrawn_at >= granted_at)
);
create unique index consent_active_grant_unique
  on public.consent_records
  (citizen_profile_id, coalesce(grantee_user_id, '00000000-0000-0000-0000-000000000000'::uuid), purpose)
  where withdrawn_at is null;
create index consent_live_lookup_idx
  on public.consent_records(citizen_profile_id, grantee_user_id)
  where withdrawn_at is null;

-- 4. Immutable version *content* after publication. Publish a NEW row to change rules.
create table public.policy_rules (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null check (policy_key ~ '^[A-Z_]{4,60}$'),
  version int not null check (version >= 1),
  status public.policy_status not null default 'draft',
  title text not null,
  rules_json jsonb not null check (jsonb_typeof(rules_json) = 'object'),
  sources_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources_json) = 'array'),
  effective_from timestamptz not null default now(),
  created_by_user_id uuid references public.users(id),
  published_by_user_id uuid references public.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  constraint policy_publish_fields check
    ((status = 'draft' and published_at is null) or
     (status in ('active','retired') and published_at is not null))
);
create unique index policy_one_active_per_key
  on public.policy_rules(policy_key) where status = 'active';

-- 5. Case is single source of current state; audit_logs provides full history.
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  citizen_profile_id uuid not null references public.citizen_profiles(id),
  created_by_user_id uuid not null references public.users(id),
  helper_user_id uuid references public.users(id),
  assigned_officer_user_id uuid references public.users(id),
  policy_rule_id uuid references public.policy_rules(id),
  status public.case_status not null default 'DRAFT',
  priority int not null default 50 check (priority between 0 and 100),
  confidence numeric(5,4) check (confidence between 0 and 1),
  factor_scores jsonb not null default '{}'::jsonb,
  hard_gates jsonb not null default '{}'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  identity_match_status text not null default 'PENDING'
    check (identity_match_status in ('PENDING','MATCH','FUZZY','MISMATCH','UNAVAILABLE')),
  document_status text not null default 'PENDING'
    check (document_status in ('PENDING','PASS','BLURRY','TAMPER_SUSPECTED','MISSING')),
  user_reason_ur text,
  user_reason_en text,
  auditor_explanation jsonb not null default '{}'::jsonb,
  officer_notes text,
  requested_proof jsonb not null default '[]'::jsonb,
  payment_status text not null default 'NOT_STARTED'
    check (payment_status in ('NOT_STARTED','SIMULATED','BLOCKED')),
  mock_payment_ref text unique check
    (mock_payment_ref is null or mock_payment_ref like 'MOCK-RAAST-%'),
  idempotency_key uuid not null unique default gen_random_uuid(),
  submitted_at timestamptz,
  decided_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_profile_idx on public.cases(citizen_profile_id, created_at desc);
create index cases_queue_idx on public.cases(status, priority desc, confidence asc, created_at asc);
create index cases_officer_idx on public.cases(assigned_officer_user_id, status);

-- 6. Append-only, hash-linked log. Store IDs, hashes, policy refs, event summaries;
-- NEVER raw names, full documents, SMS bodies, audio, secrets or tokens here.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  correlation_id uuid not null,
  actor_type text not null check
    (actor_type in ('user','agent','ai','system','api')),
  actor_user_id uuid references public.users(id),
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null check (outcome in ('SUCCESS','DENIED','ERROR','UNCERTAIN')),
  metadata jsonb not null default '{}'::jsonb,
  previous_hash text not null check (length(previous_hash) = 64),
  entry_hash text not null unique check (length(entry_hash) = 64)
);
create index audit_entity_idx on public.audit_logs(entity_type,entity_id,id);
create index audit_actor_idx on public.audit_logs(actor_user_id,id);
create index audit_correlation_idx on public.audit_logs(correlation_id,id);

-- 7. Synthetic messages only. Keep excerpt short; never auto-mark a true scam.
create table public.scam_reports (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references public.users(id),
  citizen_profile_id uuid references public.citizen_profiles(id),
  case_id uuid references public.cases(id),
  sender_label text not null check (char_length(sender_label) <= 60),
  message_excerpt text not null check (char_length(message_excerpt) <= 280),
  verdict public.scam_verdict not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  signals jsonb not null default '[]'::jsonb,
  model_version text not null,
  false_alarm_reported boolean not null default false,
  human_override public.scam_verdict,
  created_at timestamptz not null default now()
);
create index scam_reports_case_idx on public.scam_reports(case_id,created_at desc);

-- 8. Supporting public-API credentials, generated ONLY on server.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_prefix text not null unique,
  key_hash text not null unique check (length(key_hash) = 64),
  scopes text[] not null check (cardinality(scopes) > 0),
  created_by_user_id uuid references public.users(id),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Audit content is write-once; published policy *contents* cannot change.
create function private.prevent_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs are append-only';
end $$;
create trigger audit_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_change();

create function private.lock_published_policy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
       new.policy_key is distinct from old.policy_key or
       new.version is distinct from old.version or
       new.title is distinct from old.title or
       new.rules_json is distinct from old.rules_json or
       new.sources_json is distinct from old.sources_json or
       new.effective_from is distinct from old.effective_from or
       new.created_by_user_id is distinct from old.created_by_user_id or
       new.published_by_user_id is distinct from old.published_by_user_id or
       new.published_at is distinct from old.published_at or
       new.created_at is distinct from old.created_at
  ) then
    raise exception 'published policy contents are immutable; create a new version';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'retired policy versions cannot be reactivated';
  end if;
  if old.status = 'active' and new.status not in ('active','retired') then
    raise exception 'active policy can only be retired';
  end if;
  return new;
end $$;
create trigger policy_version_lock
  before update on public.policy_rules
  for each row execute function private.lock_published_policy();

-- Sequential, hash-linked audit append. Call inside SAME sql.begin() transaction
-- as the business mutation. An advisory xact lock serializes chain generation.
create function private.append_audit(
  p_correlation_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_outcome text,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text;
  v_event uuid := gen_random_uuid();
  v_at timestamptz := clock_timestamp();
  v_hash text;
  v_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261120, 1);
  select entry_hash into v_prev from public.audit_logs order by id desc limit 1;
  v_prev := coalesce(v_prev, repeat('0',64));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.concat_ws('|', v_prev, v_event::text, v_at::text,
      p_correlation_id::text, p_actor_type, coalesce(p_actor_user_id::text,''),
      p_actor_label, p_action, p_entity_type, coalesce(p_entity_id::text,''),
      p_outcome, coalesce(p_metadata,'{}'::jsonb)::text), 'UTF8')), 'hex');
  insert into public.audit_logs
    (event_id,occurred_at,correlation_id,actor_type,actor_user_id,
     actor_label,action,entity_type,entity_id,outcome,metadata,previous_hash,entry_hash)
  values
    (v_event,v_at,p_correlation_id,p_actor_type,p_actor_user_id,
     p_actor_label,p_action,p_entity_type,p_entity_id,p_outcome,
     coalesce(p_metadata,'{}'::jsonb),v_prev,v_hash)
  returning id into v_id;
  return v_id;
end $$;

-- Defense-in-depth: no browser table writes; server validates and writes
-- through PostgreSQL transactions. Client may read only policy and authorized rows.
alter table public.users enable row level security;
alter table public.citizen_profiles enable row level security;
alter table public.consent_records enable row level security;
alter table public.policy_rules enable row level security;
alter table public.cases enable row level security;
alter table public.audit_logs enable row level security;
alter table public.scam_reports enable row level security;
alter table public.api_keys enable row level security;

revoke all on public.users,public.citizen_profiles,public.consent_records,
  public.policy_rules,public.cases,public.audit_logs,public.scam_reports,
  public.api_keys from anon, authenticated;
revoke all on public.audit_logs from service_role;

-- Trusted security-definer role lookup; never read role from user_metadata.
create function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role::text from public.users
  where id = (select auth.uid()) and active = true
$$;

-- Live scope check. Deliberately uses current DB rows, not a token snapshot.
create function private.has_live_consent(
  p_profile uuid, p_grantee uuid, p_scope text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consent_records
    where citizen_profile_id = p_profile
      and grantee_user_id is not distinct from p_grantee
      and withdrawn_at is null and p_scope = any(scopes)
  )
$$;

create function private.can_read_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.citizen_profiles p
    where p.id = p_profile and (
      (p.user_id = (select auth.uid()))
      or (
        (select private.current_app_role()) = 'helper'
        and private.has_live_consent(p.id,(select auth.uid()),'profile:read')
        and private.has_live_consent(p.id,null,'platform:process')
      )
      or (
        (select private.current_app_role()) = 'officer'
        and private.has_live_consent(p.id,null,'officer:review')
        and exists (
          select 1 from public.cases c
          where c.citizen_profile_id = p.id
            and c.assigned_officer_user_id = (select auth.uid())
        )
      )
    )
  )
$$;

create policy users_self_read on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy citizens_scope_read on public.citizen_profiles
  for select to authenticated using (private.can_read_profile(id));
create policy consent_read on public.consent_records
  for select to authenticated using (
    granted_by_user_id = (select auth.uid()) or
    grantee_user_id = (select auth.uid()) or
    exists (select 1 from public.citizen_profiles p
            where p.id = citizen_profile_id and p.user_id = (select auth.uid()))
  );
create policy published_policy_read on public.policy_rules
  for select to authenticated using (status = 'active');
create policy cases_scope_read on public.cases
  for select to authenticated using (private.can_read_profile(citizen_profile_id));
create policy scam_own_read on public.scam_reports
  for select to authenticated using (
    created_by_user_id = (select auth.uid()) and
    (citizen_profile_id is null or private.can_read_profile(citizen_profile_id))
  );

-- Read grants never imply write grants. No client reads audit_logs or api_keys.
grant select on public.users,public.citizen_profiles,public.consent_records,
  public.policy_rules,public.cases,public.scam_reports to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.has_live_consent(uuid,uuid,text) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
-- Direct server-side SQL uses privileged DB credentials; never expose them.

commit;
```

**Migration portability:** This migration targets Supabase PostgreSQL 13+ and uses built-in `gen_random_uuid()` and `pg_catalog.sha256(bytea)`, not extension-specific `digest`. Verify the chain via an actual SQL insert and recalculated hash in the target project. Hash-chaining is tamper-evident for the demo, not immune to an all-powerful DBA who can disable triggers and edit database history. An external signed root would be needed in production. All business writes use server-side Postgres transactions and `private.append_audit(...)`; **do not** attempt atomic multi-table writes as separate Supabase REST calls.

## 3. Synthetic rules, data fixtures and proper provenance

### Admin-editable policy DSL (example version 1)

```json
{
  "minimum_age": 18,
  "widow_required": true,
  "max_household_income_pkr": 35000,
  "max_prior_mock_grants": 0,
  "allowed_districts": ["KARACHI_DEMO"],
  "required_proofs": ["DEMO_ID", "WIDOWHOOD_ATTESTATION"],
  "grant_amount_pkr": 12000,
  "priority_if_dependents_at_least": 2,
  "confidence_thresholds": {"approve": 0.85, "ask_proof": 0.60},
  "loss_wrong_approval": 20,
  "loss_wait_for_review": 3
}
```

This is **not** a real BISP/NADRA policy. The eligibility rule and payout amount are explicitly invented **for simulation**. `rules_json` is validated with `PolicyRuleSchema` before publication. Allowed keys only: `minimum_age`, `widow_required`, `max_household_income_pkr`, `max_prior_mock_grants`, `allowed_districts`, `required_proofs`, `grant_amount_pkr`, `priority_if_dependents_at_least`, `confidence_thresholds`, `loss_wrong_approval`, `loss_wait_for_review`. No code expressions, SQL, JavaScript, or arbitrary JSON rule execution. Threshold override may be narrowed to >= baseline by admins, never weakened below `0.85/0.60` in this hackathon.

**Publishing algorithm** (one transaction): authorize `admin`; validate new draft `version = max(version)+1`; `SELECT pg_advisory_xact_lock(hashtext(policy_key))`; retire current active; activate new draft with `published_at/by`; append `POLICY_PUBLISHED` audit containing IDs/versions/diff hash; commit. Read active rule at **case submission** under transaction and pin `cases.policy_rule_id`. Re-evaluation is an explicit, audited officer action that records old/new rule IDs; never silently update historical decisions.

### RAG requirements and source hygiene

- Retrieval set: 3–5 official, public, verified BISP pages/PDFs on **scam prevention, contact channel, and how citizens obtain official help**; maintain `title`, `url`, `publisher`, `retrieved_at`, `exact_excerpt`, `topic`, `source_type='official_public'`. Add versioned **synthetic program policy** as `source_type='simulation_rule'` and visibly label it.
- The actual official BISP pages are **informational context** only. They do **not** certify this fictional emergency relief program, its beneficiary eligibility, or any payout. Do not assert that this app is connected to BISP.
- Seed useful official anti-scam sources: `https://www.bisp.gov.pk/NewsDetail/Njk4ZDI0MTAtYzdiMy00MDMwLTljNTItZjI3OWM2MGQ4OWYz` and `https://www.bisp.gov.pk/NewsDetail/M2MzZDg0ZjctYjBkMS00YzQ1LTkwMjQtMmVhZWFiZDgyZmI0` (BISP news on 8171 and scams); verify reachable when seeding. Official content changes; record retrieval timestamp.
- `/api/v1/policy/search?q=...`: Postgres FTS or substring search on curated seed text; return `[{id,sourceType,title,url,excerpt,policyVersion}]`. LLM may summarize only returned excerpts with those IDs. Answer "not in the retrieved sources" rather than fabricating a government rule.
- `/policy/sources` shows sources, synthetic-vs-official distinction, and version links. Never use the LLM's memory to decide eligibility.

**Mock identity fixtures:** `DEMO-WD-001` → stored `Mohammad` vs voice `Muhammad`, high match after contextual corroboration; `DEMO-WD-002` → partial mismatch and missing proof; `DEMO-WD-003` → conflicting DOB/duplicate fingerprint flag; plus 37 more synthetic family labels. Names are fictional; do not paste actual phone numbers or CNICs. Seed fake SMS examples such as "Your DEMO relief Rs 12000 is ready; click https://example.invalid/claim and pay a fee" and a harmless official-looking example for false-alarm review. All channels are mock.

## 4. Exact confidence, risk, cost and routing engine

**Key principle:** **An LLM never grants money.** Structured AI extracts candidate evidence and suggestions. The TypeScript scoring function and policy evaluator make the decision. A confidence number is an *uncalibrated hackathon heuristic*, not a measured real-world probability.

### Inputs, normalized scores and equation

Each factor is a number in `[0,1]`, produced by deterministic adapters or validated model output. Missing factors default to `0` and set their mandatory hard gate to false.

| Factor | Weight | How it is calculated |
|---|---:|---|
| `I`: mock identity agreement | 0.30 | `1.00` strong verified `DEMO-ID` + corroboration; `0.75` fuzzy name plus matching DOB; `0.20` hard mismatch; `0.00` unavailable |
| `E`: synthetic policy eligibility evidence | 0.25 | fraction of required eligibility predicates proved, with contradictions => hard gate false |
| `D`: document quality/integrity | 0.15 | `1.00` demo ID/proof acceptable; `0.70` blurry but legible; `0.00` missing/tamper-suspect |
| `U`: uniqueness/duplicate safety | 0.15 | `1.00` no conflict; `0.65` possible duplicate; `0.00` confirmed duplicate |
| `S`: scam/channel safety | 0.10 | `1.00` no suspicious contact; `0.50` uncertain; `0.00` confirmed fake payment request |
| `F`: case completeness | 0.05 | `completed_required_fields / total_required_fields`, 0 if none |

```text
base = 0.30*I + 0.25*E + 0.15*D + 0.15*U + 0.10*S + 0.05*F
penalty = 0.10*(identity_name_ambiguity ? 1 : 0)
        + 0.10*(unverified_sender_claim ? 1 : 0)
        + 0.15*(suspected_document_tampering ? 1 : 0)
C = round4(clamp(base - penalty, 0, 1))
R = round4(1 - C)
expected_wrong_approval_loss = (1 - C) * 20
expected_manual_delay_loss = 3
```

**Loss interpretation:** Wrong approval is weighted **20 cost units**, slow review **3**. `expected_wrong_approval_loss <= expected_manual_delay_loss` holds only at `C >= 0.85` (within numeric precision). This encodes "wrong approvals cost more than slow approvals." These are **demo policy choices**, not validated welfare statistics.

### Hard gates (all required for auto-approval)

```text
active platform consent includes platform:process, identity:verify,
  ai:process, payment:simulate;
identity.mock_status == MATCH (not merely fuzzy); 
no unresolved identity mismatch, duplicate or tamper flag;
all required synthetic policy predicates are TRUE, with no UNKNOWN;
required evidence present and quality PASS;
no scam report linked to application with LIKELY_SCAM unresolved;
case is SUBMITTED or CHECKING; no prior simulated payment;
rule is pinned and still matches the validated published version;
all mock APIs healthy; no AI schema/guardrail validation failures.
```

**Decision order (no hidden branch):**

```ts
type Decision = 'AUTO_APPROVED' | 'MORE_PROOF' | 'OFFICER_REVIEW';
function decide(confidence: number, hardGatesPass: boolean): Decision {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    return 'OFFICER_REVIEW';
  if (confidence >= 0.85 && hardGatesPass) return 'AUTO_APPROVED';
  if (confidence >= 0.60 && confidence < 0.85) return 'MORE_PROOF';
  // High confidence with a failed hard gate is NEVER auto-approved.
  // Missing/contradictory evidence requires officer handoff, not proof-only limbo.
  return 'OFFICER_REVIEW';
}
```

**Tier table (mandatory):**

| Risk-adjusted confidence | Route | UX and system action |
|---|---|---|
| `C >= 0.85` and **all hard gates true** | **AUTO_APPROVED** | Display simple Urdu/English reason and consent reminder, write decision + audit, then generate idempotent `MOCK-RAAST-...` reference and set `MOCK_PAID`; never transmit real transfer |
| `0.60 <= C < 0.85` | **MORE_PROOF** | Show *specific missing evidence*, save case, send in-app update, permit later resubmission; no payment |
| `C < 0.60`, malformed AI, hard-gate conflict, or mock outage | **OFFICER_REVIEW** | Show literal **"I am not sure — a department officer will review this case."** Urdu equivalent and read-aloud; case notes/evidence/source IDs attached; no payment |

**Important override:** `C >= 0.85` with a failed hard gate is `OFFICER_REVIEW`, never `MORE_PROOF`. A confirmed duplicate/tamper/mismatch cannot be cleared by a high AI confidence or by a simple button. Human decisions are separately recorded as `OFFICER_APPROVED`, `REJECTED`, or `MORE_PROOF`; if approved, a fresh payment preflight rechecks consent, rule, and idempotency.

**Exact demo fixtures (all penalties zero unless noted):** A: `I=1,E=1,D=.8,U=.8,S=.8,F=1` → `C=.92`, with all non-negotiable hard gates separately PASS (the 0.8 scores represent resolved, nonblocking quality uncertainty). B: `I=.75,E=.8,D=.7,U=.8,S=.5,F=.6` → `C=.73`, ask for specified proof. C: `I=.2,E=.6,D=.4,U=.4,S=.7,F=.8` → `C=.44`, officer handoff. Store score vectors and gate results alongside fixture expected outputs; don't spoof `confidence` directly in route handlers. Vitest asserts scores and routes.

### Fuzzy spellings, duplicates, and error honesty

- Normalize lowercase, trim, collapse whitespace, convert common `Muhammad/Mohammad/Muhammed` prefix to a canonical lookup token **for candidate retrieval only**. Keep original/aliases in `name_variants`; never overwrite legal/display names automatically.
- Candidate ranking: `similarity = 0.55 * trigramName + 0.30 * mockDOBMatch + 0.15 * mockHouseholdMatch`. Names alone may **never** establish identity. Confirm with `DEMO-ID` plus DOB/household synthetic reference. Unclear/ambiguous candidates always get officer review, never automatic merge.
- Duplicate detection: deterministic match on demo identity ID and existing active/past simulated grant; fuzzy same-name different ID is a *flag*, not a verified duplicate. Missing identity API -> `UNAVAILABLE`, never `MATCH`.
- Documents: validate MIME, bytes, dimensions, blur score and demo watermark/QR fixture; use a bounded OCR adapter only for synthetic docs. Flag suspicious manipulation as **"potential issue — needs review"**, not proven fraud. Track false positives/overrides.
- Scam checks classify `LIKELY_SCAM`, `UNCERTAIN`, `LIKELY_SAFE`, show confidence and evidence (fee demand, unknown sender, suspicious link). Do **not** mark messages safe solely because sender string says `8171`; spoofed text is possible and the endpoint does not verify telecom delivery.

## 5. End-to-end workflow and state machine

1. **Login** through Supabase Auth. Verified JWT subject maps to `users` role. Public scam checker is available with restricted partner key; private cases always require bearer auth.
2. **Select citizen** directly or by helper from family switcher. Switching destroys previous client cache, form state, media preview, voice text, and consent context; reset route, invalidate all profile-scoped queries, and reauthorize selection.
3. **Consent** is explained in plain Urdu + audio: what data, who sees it, what happens on withdrawal. Citizen-assisted demo tap/voice acknowledgement records distinct `consent_records`: helper-grant with scopes (`profile:read`, `profile:correct`, `case:read`, `case:write`) and platform-grant with (`platform:process`,`identity:verify`,`ai:process`,`officer:review`,`payment:simulate`). Do **not** create a platform grant without recorded citizen demo consent. Voice evidence uses `DEMO:` reference, not stored biometrics.
4. **Create case** (`DRAFT`) with request idempotency key. Capture synthetic family ID, widow attestation, household, distress, document. Progressive-save to server on each step when connected; non-sensitive draft cues may persist offline. Write audit.
5. **Submit/check:** validate live consent; pin active `policy_rule_id`; call identity/data/document/scam mock services with allowlisted bounded agent; write an audit entry for each action and tool result; RAG explains policies with sources. Structured evidence is validated server-side before the deterministic scoring function runs.
6. **Decision:** store confidence vector, hard gates, source IDs, plain-language user reason, detailed auditor trace and rule version. Exact branch as Section 4. Notifications appear in timeline.
7. **Auto-approved:** call mock payment with idempotency key `case.id`, recheck consent before and after external/mock call, write payment reference and audit in same committed outcome. There is no real payment network access.
8. **Needs more proof:** keep draft/proof request; citizen/helper can return; each new evaluation produces new audit entries and is pinned to existing case rule version until an officer explicitly re-evaluates.
9. **Officer review:** queue by urgency descending and confidence ascending, choose case, view redacted-safe notes with active consent, approve/reject/request proof/escalate, record rationale and actor.
10. **Withdraw:** citizen or properly authorized helper submits withdrawal; mark relevant grants withdrawn in **one DB transaction** and audit `CONSENT_WITHDRAWN`; all future sensitive reads, agent actions, in-flight jobs, and signed URLs are blocked. Revoke/expire any generated file URLs and clear cached responses. If platform scope withdrawn set active case `CONSENT_WITHDRAWN` and block payment. Citizen access/correction remains available.
11. **Audit:** auditor sees event metadata, confidence factors, rule/prompt/tool versions, source IDs, redacted hashes, identity conflict and human override; never raw personal information after revocation.

**Officer queue priority:** Recalculate on submission and each case status change: `priority = clamp(50 + 20*(household_size >= 3) + 20*(status == OFFICER_REVIEW) + 10*(age_hours >= 24) - 10*(status == MORE_PROOF), 0, 100)`. The persisted queue sorts `priority DESC`, then `confidence ASC NULLS FIRST`, then oldest first. This is a transparent demo triage heuristic, not a measure of human worth.

**Status transitions (server-enforced; invalid transitions return HTTP 409):**

```text
DRAFT -> SUBMITTED -> CHECKING
CHECKING -> AUTO_APPROVED -> MOCK_PAID -> CLOSED
CHECKING -> MORE_PROOF -> SUBMITTED
CHECKING -> OFFICER_REVIEW -> OFFICER_APPROVED -> MOCK_PAID -> CLOSED
OFFICER_REVIEW -> MORE_PROOF | REJECTED | ESCALATED
ESCALATED -> OFFICER_REVIEW | CLOSED
REJECTED -> CLOSED
ANY NONTERMINAL STATUS -> CONSENT_WITHDRAWN
CONSENT_WITHDRAWN -> CLOSED (metadata only; no processing)
```

Only authorized officers/admins may escalate/approve/reject; helpers may create and submit **only with profile-specific consent**; AI cannot alter officer-only states.

## 6. Pages, route contracts, errors and API keys

### Pages by persona

| Page | Allowed roles | Build behavior |
|---|---|---|
| `/dashboard` | all signed-in | role-aware task cards, recent status, audit-safe history |
| `/citizen/claim` | citizen | six-step guided claim, Urdu audio, icons, autosave, progress |
| `/citizen/cases/[caseId]` | citizen; authorized helper | status, reason, source citations, mock payment, corrections |
| `/helper/families` | helper | 40 mock family cards, filter, active family banner, switch+wipe |
| `/helper/families/[profileId]` | helper with live consent | per-family case progress, grant/revoke permission |
| `/helper/cases/new` | helper with live consent | assisted wizard, evidence, submit |
| `/officer/queue` | officer | sort `priority DESC`, `confidence ASC`, oldest first; redacted row if consent absent |
| `/officer/cases/[caseId]` | assigned officer with live consent | evidence, notes, 3 decision controls, human override |
| `/admin/rules` | admin | preview diff, create draft, publish version without deploy |
| `/auditor/cases/[caseId]` | auditor | immutable chronological trace, hash-chain verification, **redacted** consent-safe fields |
| `/consent/[profileId]` | citizen or appropriately authorized helper | granular see/share/withdraw; citizen data correction |
| `/scam-check` | authenticated shopkeeper (`citizen` role), citizen, helper; public partner key demo | input synthetic SMS or screenshot; risk signals + false-alarm feedback |
| `/docs` | public | Swagger UI; try API key on mock policy/scam endpoints |
| `/policy/sources` | all | official-public vs synthetic-demo source labels |

**Mandatory universal banner on every page and Swagger:** `PROTOTYPE ONLY • SIMULATED DATA • NOT A GOVERNMENT SERVICE • NO REAL MONEY` (Urdu translation alongside). Add in root `app/layout.tsx`, including login, public pages, print/error screens, and mobile.

### REST API contract (versioned; JSON only unless stated)

| Method and path | Auth | Input / output; audit action |
|---|---|---|
| `POST /api/v1/cases` | citizen/helper JWT + live consent | `{profileId,idempotencyKey}` -> `{caseId,status}`; `CASE_CREATED` |
| `GET /api/v1/cases/:id` | owner/consented helper/assigned officer JWT | redacted role-specific case, progress/history; `CASE_VIEWED` |
| `POST /api/v1/cases/:id/submit` | citizen/helper JWT + consent | Zod validated answers -> pinned rule + `SUBMITTED`; `CASE_SUBMITTED` |
| `POST /api/v1/cases/:id/evaluate` | internal service only | bounded mock tools + score -> structured decision; `CASE_EVALUATED` |
| `POST /api/v1/cases/:id/proof` | citizen/helper JWT + consent | synthetic proof ID -> `MORE_PROOF`/resubmit; `PROOF_ADDED` |
| `POST /api/v1/cases/:id/decision` | assigned officer JWT | `{decision,reason}`; `OFFICER_DECISION` |
| `POST /api/v1/cases/:id/escalate` | officer/admin JWT | reason + assignee -> `ESCALATED`; `CASE_ESCALATED` |
| `POST /api/v1/cases/:id/close` | officer/admin JWT | terminal close; `CASE_CLOSED` |
| `GET /api/v1/officer/queue` | officer JWT | sorting, only permitted evidence; `QUEUE_VIEWED` |
| `GET /api/v1/citizens/:id/consent` | citizen/authorized helper JWT | current grants/scopes; `CONSENT_VIEWED` |
| `POST /api/v1/citizens/:id/consent` | citizen/authorized assisted helper JWT | scopes, evidence mode, purpose; `CONSENT_GRANTED` |
| `POST /api/v1/citizens/:id/consent/withdraw` | citizen/authorized consent initiator JWT | revoke scope/grantee, block access immediately; `CONSENT_WITHDRAWN` |
| `PATCH /api/v1/citizens/:id` | citizen or helper with `profile:correct` consent | permitted synthetic corrections with `beforeHash/afterHash`; `PROFILE_CORRECTED` |
| `GET /api/v1/policy/search?q=` | JWT | sourced passages; `POLICY_SEARCHED` |
| `POST /api/v1/scam/check` | JWT | `{senderLabel,messageExcerpt}` -> verdict, reasons, source refs; `SCAM_CHECKED` |
| `POST /api/v1/scam/:id/false-alarm` | JWT | `{reason}` -> human-review flag; `SCAM_FALSE_ALARM_REPORTED` |
| `POST /api/v1/voice/transcribe` | JWT + consent when linked to profile | `audio/webm` synthetic only -> Urdu text; `VOICE_TRANSCRIBED` |
| `POST /api/v1/voice/speak` | JWT | short allowlisted text -> audio stream (fallback local clips); `VOICE_SPOKEN` |
| `POST /api/v1/documents/inspect` | JWT + live consent | synthetic image -> OCR/blur/QR flags; `DOCUMENT_INSPECTED` |
| `GET /api/v1/admin/rules` | admin JWT | versions and drafts; `RULES_VIEWED` |
| `POST /api/v1/admin/rules` | admin JWT | validate/create draft; `POLICY_DRAFT_CREATED` |
| `POST /api/v1/admin/rules/:id/publish` | admin JWT | publish transaction; `POLICY_PUBLISHED` |
| `GET /api/v1/audit/cases/:id` | auditor JWT | ordered redacted trace, chain status; `AUDIT_VIEWED` |
| `GET /api/public/v1/policies` | `X-API-Key` scope `policy:read` | sanitized synthetic policy metadata; `API_POLICY_READ` |
| `POST /api/public/v1/scam-check` | `X-API-Key` scope `scam:check` | synthetic text -> safe verdict (no citizen PII); `API_SCAM_CHECKED` |
| `POST /api/mock/v1/identity/verify` | server-to-server `X-Internal-Mock-Key` + case/consent preflight | `{caseId,demoIdentityId,claimedName}` -> `{matchStatus,confidence,candidateIds}`; `IDENTITY_TOOL_CALLED` |
| `GET /api/mock/v1/data/citizens/:demoIdentityId` | server-to-server key + case-scoped consent | synthetic DOB/household eligibility attributes; `DATA_TOOL_CALLED` |
| `POST /api/mock/v1/payments/raast/disburse` | server-to-server key + approved case + repeat live consent/idempotency | `{caseId,idempotencyKey}` -> `{reference:"MOCK-RAAST-...",simulated:true}`; `MOCK_PAYMENT_SIMULATED` |
| `GET /api/openapi` | public | OpenAPI 3.1 document; no secret values |
| `GET /docs` | public | Swagger UI with persistent disclaimer |

Mock rails have clean, typed in-process interfaces under `lib/rails/*` and the **three explicit mock REST adapter endpoints** above, which share the same Zod contracts. Keep the mock HTTP endpoints inaccessible to end-user browsers: require server-to-server secret, case-bound server authorization and per-profile live consent; reject requests without internal credentials. The adapter may be disabled on deployed demo if unneeded, but in-process service interfaces remain implemented and tested. API callers never supply arbitrary tool names, rule IDs, payment amounts, or officer assignments.

**API key lifecycle:** Generate 32 random bytes server-side, present full plaintext **once**, store `SHA-256(key)` plus a human-readable prefix, scopes and expiration; compare derived hash in constant time; enforce a per-key throttle, no PII scopes, revoke from admin UI, audit use/denial. Keys live in `api_keys`, not Git. There is no anonymous access to `/api/v1/cases`.

**Errors and idempotency:** Return `{error:{code,message,correlationId}}`; 401 unauthenticated, 403 wrong role/withdrawn consent, 404 inaccessible object (avoid enumeration), 409 state conflict/repeat, 422 invalid data, 429 rate limit, 503 mock provider unavailable. `Idempotency-Key` required on create and payment triggers; replays return same case/ref, not duplicates. `Cache-Control: private, no-store` on all case, consent, file, audit and decision responses.

**OpenAPI minimal requirement:** Document `bearerAuth` (`type: http`, `scheme: bearer`, `bearerFormat: JWT`), `partnerApiKey` (`type: apiKey`, `in: header`, `name: X-API-Key`), request/response schemas, error shapes, example synthetic payloads, consent 403, and `x-prototype-only: true`. Validate YAML with `@apidevtools/swagger-parser` and keep `/api/openapi` served from the checked-in file.

## 7. Eight technical challenges mapped to code

| Judge's challenge | Mechanism (exact module) | UX route | API/test proof |
|---|---|---|---|
| **1. Cost of being wrong** | `lib/domain/confidence.ts` weighted factors, loss `20:3`, hard gates | `/citizen/cases/[caseId]`, `/officer/queue` | `/api/v1/cases/:id/evaluate`; tests `confidence.test.ts` for `.85`, `.60`, contradictions |
| **2. "I am not sure"** | `lib/domain/case-machine.ts`; structured unknown/missing evidence notes | officer case, citizen status | eval -> `OFFICER_REVIEW`, literal handoff line, no payment |
| **3. Bad data / duplicates** | `lib/domain/identity-match.ts`; normalize aliases, mock DOB and unique synthetic ID | wizard identity step, officer evidence | identity mock tool; no auto-merge; tests Muhammad/Mohammad/Muhammed |
| **4. Rules change** | `policy_rules` immutable published versions; DSL interpreter | `/admin/rules` | publish endpoint; old `cases.policy_rule_id` unchanged |
| **5. Explain & audit** | `private.append_audit`, `auditor_explanation`, display redaction | citizen reason and `/auditor/cases/[caseId]` | hash-chain integrity test + each action correlation ID |
| **6. Consent & take-back** | `private.has_live_consent` + server guard on every request/tool; no-store | `/consent/[profileId]` | withdraw -> immediate 403 helper; blocked worker/payment; audit records revocation |
| **7. Works for everyone** | Urdu text, large icons, audio, server autosave, light offline shell | wizard, 40-family helper switcher | low-speed test; audio fallback; draft resume, isolate family data |
| **8. Scams / fake documents** | `lib/ai/guardrails.ts`, scam signals, demo image integrity and uncertainty | `/scam-check`, proof step | `/api/v1/scam/check`, documents inspect, false-positive route |
| **BONUS: Helper Mode** | explicit per-family grants, wipe on switch, 40 synthetic families | `/helper/families` | test `family A -> B -> A`, no data leaks; withdraw one leaves other accessible |

### Low bandwidth and Urdu voice: implementation contract

- Default to small SVG/icons, system fonts with fallback Urdu-capable stack, no autoplay audio, no heavy animation, avoid base64 images, compress only synthetic uploads, and lazy-load OCR/AI modules.
- Mobile: single-column 48px+ tap targets, icons+Urdu labels, one question at a time, step progress and back button, explicit error/retry, reachable offline warning, short narrated instructions. Include English toggling.
- Voice: `Record Urdu answer` -> send only demo synthetic audio with consent -> STT -> show transcript for confirmation -> structured fields; for TTS use short Urdu clips via provider or bundled **clearly synthetic** fallback audio. Voice is optional input: all flows work with buttons and helper-assisted text when microphone/STT fails.
- Offline/weak-signal: service worker caches **only static shell and source translations**; store ephemeral per-family non-sensitive step progress/draft operation IDs, not photos, voice, raw identity or tokens. Persist canonical drafts server-side as soon as online. Show `Saved locally / Sync pending / Synced` statuses; never claim submitted until acknowledged. `BroadcastChannel`/tab-switch wipe is optional but shared-phone button must clear live state immediately. Never cache sensitive GET responses in service worker.
- Shared phone: tap "Finish with family" -> clear component state and any per-profile browser query cache, destroy media preview, clear local draft handle and push to neutral family picker; session inactivity 2 min for helper view; re-check consent on every backend interaction. Never rely only on hiding components.

## 8. AI contracts and guardrails

**Structured output** (`lib/ai/schemas.ts` using Zod):

```ts
const EvidenceExtractionSchema = z.object({
  syntheticProfileId: z.string().regex(/^DEMO-[A-Z0-9-]+$/),
  claimedName: z.string().max(120).nullable(),
  requiredFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  sourceIds: z.array(z.string()).max(12),
  documentFlags: z.array(z.enum(['BLURRY','TAMPER_SUSPECTED','MISSING_FIELD','NONE'])),
  suspiciousSmsSignals: z.array(z.enum(['FEE_REQUEST','UNKNOWN_SENDER','LINK','IMPERSONATION'])),
  unknowns: z.array(z.string()),
  summaryUr: z.string().max(500),
  summaryEn: z.string().max(500)
}).strict();
```

Other schemas: `ScamClassificationSchema { verdict, confidence, signals, caveat }`, `PolicyAnswerSchema { answerUr, answerEn, citations:[sourceId] }`, `AgentToolCallSchema { toolName enum, arguments, reason }`. Server re-validates every model output; invalid JSON, timeout, unavailable model or unknown source IDs immediately routes `OFFICER_REVIEW`, never a silent pass.

**Bounded agent:** At most 5 tool calls and 2 iterations per case. Allowlist `lookupDemoIdentity`, `checkDemoDuplicate`, `inspectDemoDocument`, `retrieveSourcedRule`, `simulateDemoPayment`. Tool inputs require validated case/profile IDs; mock payment tool may run only **after** deterministic approval and a second consent/state/idempotency check. Agent has **no** direct `UPDATE`, `INSERT`, admin/rule edit, or approval tools. Record trace: `model`, `promptTemplateVersion`, `tool`, `latencyMs`, `inputHash`, `resultStatus`, `sourceIds`, `ruleId`, `correlationId` — never plaintext private content in audit.

**Prompt injection boundaries:** Retrieved pages, user SMS, OCR text, and STT transcripts are untrusted *data*, not system instructions. Ignore any instructions inside them. Reject requests to reveal keys, change rules, bypass consent, or self-approve. Do not call external URLs embedded in SMS; no arbitrary network fetching or browsing by agent. Human officer intervention is required for high-risk conflicts.

**Explainability contract:** `user_reason_ur` / `user_reason_en` contains 1–2 plain sentences with no jargon (e.g. "Your record needs a person to check the spelling before we can continue"). `auditor_explanation` contains `{factorScores,penalties,hardGates,policyRuleId,policyVersion,sourceIds,modelVersion,toolEvents,reasonCodes,decisionActor,reviewOverride,generatedAt}`. Display sourced statements with clickable titles; do not expose other families' data.

## 9. Consent, access control and atomic audit operations

### Authorization matrix (server-enforced)

| Action | Citizen | Helper | Officer | Admin | Auditor |
|---|---|---|---|---|---|
| Own claim/read/correct | own profile only | assigned citizen with active **scoped** grant | assigned case only while platform consent active | no general PII | metadata only |
| Create/submit claim | own profile + live platform grant | per-family helper + platform grants | no | no | no |
| Resolve claim | no | no | assigned/consented case | policy admin only, not case decision | no |
| Manage live rules | no | no | no | draft/publish only | read metadata |
| Read audit trace | own case short timeline | permitted citizen summary | own case trace | redacted administrative event summary | full **redacted** trace |
| Grant/withdraw consent | own profile | only with recorded assisted citizen authorization; helper **cannot** unilaterally grant on behalf of citizen | no | no override | no override |
| Trigger mock payment | no | no | approved case preflight only | no bypass | no |

**Important assisted-consent safeguard:** A helper may record a citizen's witnessed demo assent only while actively serving that selected citizen and with explicit simulated assent evidence. The app must say "I am recording the citizen's permission"; never silently grant consent on family selection. Allow citizen to withdraw directly or via fresh witnessed assisted withdrawal, including when helper grant is already withdrawn (citizen can use a neutral revocation endpoint or officer-assisted revocation without exposing old case data).

**Mutation transaction pseudo-implementation:**

```ts
await sql.begin(async (tx) => {
  const actor = await requireVerifiedActor(request); // JWT + DB role
  await assertRole(actor, ['citizen', 'helper']);
  const [caseRow] = await tx`select * from public.cases where id=${caseId} for update`;
  if (!caseRow) throw new NotFoundError();
  await assertConsentLive(tx, caseRow.citizen_profile_id, actor.id, 'case:write');
  await assertPlatformConsentLive(tx, caseRow.citizen_profile_id, 'platform:process');
  await assertAllowedTransition(caseRow.status, 'SUBMITTED');
  await tx`update public.cases set status='SUBMITTED', submitted_at=now()
           where id=${caseId}`;
  await tx`select private.append_audit(
    ${correlationId},'user',${actor.id},${actor.role},'CASE_SUBMITTED',
    'case',${caseId},'SUCCESS',${tx.json({ruleId: pinnedRuleId})}
  )`;
});
```

The snippet is illustrative: `requireVerifiedActor`, consent assertions, state checks and `NotFoundError` are app-defined helpers; check exact TypeScript types when implementing. The **contract** is what matters: one DB transaction, row locks, live consent/role checks, state machine, case update, audit append, one commit. For reads and denied actions, write redacted access audits separately and still return the correct status.

**Withdrawal race handling:** Consent revoke must acquire the same per-profile transaction advisory lock used for *every* data-processing and mock-payment preflight, then commit a revocation timestamp. All sensitive reads/agent steps require a fresh DB consent check; before using a generated signed URL or committing payment, recheck. Never rely on JWT-embedded consent, stale client caches, or background-job snapshots. If withdrawal occurs while a tool is running, discard the result and audit `CONSENT_BLOCKED`. App cannot retroactively erase access already granted; say this plainly in consent UI.

## 10. 44-hour, four-phase execution plan

| Phase and time | Ownership / deliverable | Hard exit gate |
|---|---|---|
| **P1 — Foundation, hours 0–10** | Tech lead: Next App Router, Tailwind, Supabase auth, schema migration, role seed, root banner, `/docs` OpenAPI; backend: `requireRole`/`requireConsent`, audit wrapper | Login as 3 roles; case+audit atomic write; RLS prevents unauthorized browser reads |
| **P2 — Golden path, hours 10–23** | Backend: create/submit, mock identity/data, dynamic rule evaluator, score/gates, payment idempotency; frontend: widow/helper wizard + 40-family switcher + progress | Demo A auto-paid, B more-proof, C officer queue; old family data absent on switch |
| **P3 — Safety + AI, hours 23–35** | AI engineer: sourced RAG, tool call trace, structured schemas, scam check, lightweight document flags, Urdu prompts/audio; backend: consent withdrawal and rule publishing; frontend: officer, admin, auditor pages | Revoke -> immediate 403; mock tool blocked; policy v2 published; officer acts; auditor sees both traces |
| **P4 — Prove and ship, hours 35–44** | QA: tests on risk boundaries, cross-family access, rule pinning, audit integrity; DevOps: deploy + README + video; team: rehearsed 2–3 minute story | Public URL, GitHub, OpenAPI try-it, `npm run test`, `npm run build`, demo recording all functional |

**Roles/parallel lanes:** 1 owner for schema/auth, 1 for case/AI/risk, 1 for UI/Urdu/voice, 1 for tests/docs/deployment. With fewer people, do P1 and P2 first and drop experimental OCR/provider TTS before cutting consent, RBAC, audit, or end-to-end completion. Stop adding features at hour 35.

### Judges' five-minute demo script

1. Show persistent **prototype banner**, explain one task and three personas.
2. **Helper** logs in; chooses DEMO-WD-001 from 40 families; citizen gives distinct assisted permission with Urdu explanation; submits voice/helped claim. Show Mohammad/Muhammad reconciliation **with corroboration**, not blind string matching.
3. **Citizen** sees `0.92`, hard-gates passed, simulated grant and `MOCK-RAAST-...` reference, simple reason, timeline. Refresh: no double grant.
4. **Shopkeeper** pastes a fake relief SMS; classifier highlights payment fee + suspicious link and uncertainty/false-alarm reporting. State clearly that it does not authenticate telecom senders.
5. **Officer** views `0.44` case with explicit "I am not sure" and attached notes; takes human action; queue prioritizes risk.
6. **Admin** publishes v2 rule; historical case still shows v1 and corresponding source version.
7. **Citizen/helper consent** withdrawn: open helper case again -> immediate 403; mock agent/payment blocked. **Auditor** sees timestamped, hash-chained redacted record of the denial and withdrawal.
8. Open `/docs`, show API key call and protected endpoint; close with README, GitHub, deployed link.

## 11. Minimum automated acceptance tests

- `confidence.test.ts`: `0.8499 -> MORE_PROOF`; `0.8500 + all gates -> AUTO_APPROVED`; `0.6000 -> MORE_PROOF`; `0.5999 -> OFFICER_REVIEW`; `0.99 + duplicate gate false -> OFFICER_REVIEW`; loss threshold; invalid `NaN -> OFFICER_REVIEW`.
- `identity.test.ts`: spelling aliases candidate retrieval, requires second independent signal, ambiguous profiles never auto-merged.
- `consent.test.ts`: helper can access A only, not B; withdrawal of A immediately blocks helper/AI/officer/payment, while B unaffected; every request rereads DB; citizen correction possible post-withdrawal.
- `rbac.test.ts`: citizen cannot officer-decide, helper cannot publish rules, auditor cannot access raw PII; public key cannot access private cases; expired/revoked key fails.
- `rule-versions.test.ts`: publish v2 without deploy; case pinned to v1; edit of published content rejected by trigger; re-evaluation explicit and audited.
- `audit.test.ts`: every mutation creates event transactionally; rollback creates neither; update/delete audit row rejected; hash chain validates; denied access logs redact PII.
- `idempotency.test.ts`: retry create and payment does not duplicate case/reference; withdrawal during mock pay blocks finalization.
- `scam.test.ts`: fake fee/link flagged; ambiguous sender returns `UNCERTAIN`; false-alarm report possible; harmless case not called proven scam.
- `e2e/helper-mode.spec.ts`: login, 40 profiles, switch A→B, no A data in form/cache/DOM, revoke A, B stays usable.
- `e2e/demo.spec.ts`: three decisions; officer review; admin v2; auditor trace; banner on login, app, docs, error state; weak-network UI retry.

### Production-minded caveats (do not hide from judges)

- This is an engineered **prototype** with synthetic data and no government integration. Official anti-fraud sources provide context, **not** program authorization.
- Confidence is a transparent heuristic, not calibrated; false positives/false negatives are displayed, and high-stakes errors go to humans.
- Hash-chaining and trigger immutability detect normal unauthorized row edits; DB superuser compromise requires external anchoring and dedicated governance.
- Shared-phone assisted consent is demonstrated with simulated witnessed assent; production requires legal/accessible consent validation, retention/deletion policy, and stronger anti-coercion controls.
- Offline mode deliberately does **not** retain private documents, voice recordings, or full case data on shared devices.

## 12. References for implementation and anti-scam grounding

- Next.js App Router route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Supabase SSR Auth guidance: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase RLS/grants: https://supabase.com/docs/guides/database/postgres/row-level-security
- BISP official public anti-scam guidance: https://www.bisp.gov.pk/NewsDetail/Njk4ZDI0MTAtYzdiMy00MDMwLTljNTItZjI3OWM2MGQ4OWYz
- BISP official public statement re 8171/no survey fee: https://www.bisp.gov.pk/NewsDetail/M2MzZDg0ZjctYjBkMS00YzQ1LTkwMjQtMmVhZWFiZDgyZmI0

> **Rule of the hackathon:** One complete, safe and explainable case beats eight partial demos. **No auto-approval without hard gates, no sensitive access without live consent, and no mutation without audit.**
