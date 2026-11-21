-- Slice B: server-side draft storage for the guided claim (synthetic answers only).
begin;
alter table public.cases
  add column if not exists claim_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(claim_answers) = 'object');
commit;
