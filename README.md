# Rahat Rails

> **PROTOTYPE ONLY • SIMULATED DATA • NOT A GOVERNMENT SERVICE • NO REAL MONEY**
> Synthetic demo for a hackathon. Never enter a real CNIC, phone number, bank detail or beneficiary record.
> Official BISP pages are used only as *anti-scam information*; they do not certify this fictional relief program.

A structured (not chatbot) workflow that lets a low-literacy widow — directly or with a community helper — make a
**synthetic** relief claim, protected from scam texts and ambiguous identity records. A deterministic engine, not an LLM,
decides; every mutation is audited in the same database transaction.

## Golden path

login → family selection → witnessed, per-family consent → guided claim (autosaved) → submit → mock identity / data /
document checks → version-pinned deterministic score → one of three outcomes:

| Score C | Gates | Outcome |
|---|---|---|
| ≥ 0.85 | all pass | `AUTO_APPROVED` → idempotent **simulated** `MOCK-RAAST-…` reference |
| 0.60 – <0.85 | – | `MORE_PROOF` with the specific missing items |
| < 0.60, or any gate fails | – | `OFFICER_REVIEW`: "I am not sure — a department officer will review this case." |

`C = clamp(0.30·I + 0.25·E + 0.15·D + 0.15·U + 0.10·S + 0.05·F − penalties)`; wrong-approval loss 20 vs delay 3.
Not a calibrated probability. Demo fixtures: **DEMO-WD-001 → 0.92**, **DEMO-WD-004 → 0.73**, **DEMO-WD-002 → 0.44**;
DEMO-WD-003 (duplicate + tamper flag) is never paid.

## Setup

```sh
npm install
cp .env.example .env.local     # NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co), anon key,
                               # SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, INTERNAL_MOCK_SECRET
# apply supabase/migrations/*.sql in order to your Supabase project (init, then case_answers)
npm run seed                   # 5 role accounts, policy v1 active + v2 draft, BISP excerpts, 40 families
npm run dev                    # http://localhost:3000 -> "One-click synthetic demo login"
```

Demo accounts are `<role>@rahat-rails.test`; the one-click login is available in local development and production. Its password is `DEMO_USER_PASSWORD` or the fallback `DemoPass123!`; when seeding hosted Supabase, use the same configured password.

Checks: `npm run lint && npm run typecheck && npm test && npm run build`.
Runtime verification against the real database (59 checks; resets demo cases afterwards, audit rows stay):
`npx tsx --conditions=react-server scripts/verify-demo.ts`.

## Screens by role

| Route | Role | What |
|---|---|---|
| `/helper/families` | helper | 40 synthetic families on one shared phone; per-family consent grant/withdraw; clears browser state on entry |
| `/citizen/claim` | citizen, helper | 4-step guided claim, Urdu toggle, voice buttons, autosave status |
| `/citizen/consent` | citizen, helper | view, share, **withdraw now** (blocks helper, officer, payment immediately) |
| `/citizen/cases/[id]` | citizen, helper | decision, Urdu/English reason, proof requests, `MOCK-RAAST` ref, status history |
| `/officer/queue`, `/officer/cases/[id]` | officer | priority queue; approve / reject / request proof (needs live consent + assignment) |
| `/scam-check` | citizen (shopkeeper), helper, officer | SMS classifier + ID-image check, official BISP excerpts, false-alarm reporting + running metrics |
| `/admin/rules` | admin | edit draft, create, **publish a new version without redeploy**; shows cases pinned per version |
| `/auditor/logs` | auditor | hash-chain verification, ordered events, citizen explanation beside the technical trace |
| `/docs`, `/api/openapi` | public | Swagger UI / OpenAPI 3.1 |

## Architecture

```
Browser -> proxy.ts (session refresh) -> Server Component / Server Action / Route Handler
             -> lib/auth: verify Supabase JWT (getUser) -> fresh role from public.users
                -> lib/services/*: requireProfileAccess + LIVE consent query + state machine
                   -> lib/domain/* (pure): confidence, rules DSL, case-machine, identity-match
                   -> lib/rails/* (mock): identity, data, payment, document - in-process
                   -> ONE postgres transaction: business write + private.append_audit (hash chain)
Supabase Postgres: RLS on, no browser writes, append-only audit trigger, immutable published-policy trigger
/api/mock/{nadra,raast,policy-registry}: same mock logic over HTTP, guarded by INTERNAL_MOCK_SECRET + live consent
```

- **Consent is read live from Postgres on every request/tool/payment**, under a per-profile advisory lock shared with
  withdrawal. No JWT scopes, no caches. Helper and platform grants are separate rows per family.
- **Rules live in `policy_rules`**; a case pins `policy_rule_id` at submission. Publishing a new version retires the old one but
  old cases keep theirs. Rule JSON is validated by a strict Zod schema (whitelisted keys; thresholds cannot drop below
  0.85 / 0.60); no `eval`.
- **Audit metadata is allow-listed** (`lib/db/audit.ts`): no names, SMS bodies, payment refs or tokens.

## Model / tool selection rationale

- **No LLM makes or influences a decision.** Scoring, hard gates and routing are pure TypeScript with unit tests, so outcomes are
  reproducible, explainable and auditable, and prompt injection cannot reach the money path.
- **Scam checker = deterministic signal rules** (fee, link, credential request, urgency, impersonation, unknown sender,
  injection attempt). Output is an uncertainty label with modest confidence and a spoofing caveat; "8171" as sender never makes a
  suspicious message safe. Message text is data: links are never fetched, embedded instructions are only recorded.
- **RAG = keyword retrieval over curated, sourced snippets** stored with the policy version (no vector DB, no model memory).
  Official BISP anti-scam excerpts (`OFFICIAL PUBLIC ANTI-SCAM INFO`) are labelled separately from the invented
  `SYNTHETIC DEMO RULE vN`. An LLM provider (`lib/ai/provider.ts`) is **not wired**; the deterministic fallback is the product.
- **Document check = browser-side image statistics** (Laplacian-variance blur, block-noise inconsistency, `BarcodeDetector` QR).
  The image never leaves the device; only numbers are posted. Results say "potential issue - needs review", never "fraud".
- **Voice = Web Speech API** (`ur-PK`), optional, tap-to-start, transcript confirmation; if no Urdu voice or recognizer exists the UI
  says so instead of substituting another voice.
- **Postgres + the `postgres` driver, no ORM**, so a case change and its audit event are one transaction.

## Known limits (honest list)

- Voice and QR depend on browser support (Chrome/Edge best) and were not tested on real devices.
- Offline: only an opaque step number and a "pending sync" flag are kept in `localStorage` (`rr:progress:<caseId>`), by design —
  answers, names and documents are never stored locally on a shared phone. There is **no service worker / offline shell yet**, and
  an offline submit is never reported as submitted. Drafts must be re-synced online.
- Tamper detection is crude statistics, not forensics. Hash-chaining is tamper-evident only; a DB superuser could rewrite history.
- Payment and officer approval only ever produce a mock reference. Admin cannot read private records.
- Not implemented yet: partner API keys (`/api/public/v1`), Playwright E2E, deployment, demo video.
