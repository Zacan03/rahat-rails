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
