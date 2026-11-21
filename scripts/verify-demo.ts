/**
 * Runtime verification of the Slice B golden path against the real (synthetic) database.
 * Run: npx tsx --conditions=react-server scripts/verify-demo.ts
 * Pass --keep to leave created cases/consents in place (default: clean demo state afterwards).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};

async function expectError(fn: () => Promise<unknown>, status: number, code?: string) {
  try {
    await fn();
    return false;
  } catch (e) {
    const err = e as { status?: number; code?: string };
    return err.status === status && (code === undefined || err.code === code);
  }
}

async function main() {
  const { getDb } = await import("../lib/db/client");
  const { grantConsent, withdrawConsent } = await import("../lib/services/consent-service");
  const { getOrCreateDraft, submitCase, officerDecide, saveDraft } = await import("../lib/services/claims");
  const { loadCaseForActor, loadOfficerQueue, loadOfficerCase } = await import("../lib/services/views");
  const { verifyAuditChain } = await import("../lib/db/audit");
  const { claimTemplateFor } = await import("../lib/rails/fixtures");
  type Actor = import("../lib/auth/types").VerifiedActor;

  const db = getDb();
  const users = await db<{ id: string; display_name: string; role: Actor["role"] }[]>`
    select id, display_name, role from public.users`;
  const by = (r: string) => {
    const u = users.find((x) => x.role === r);
    if (!u) throw new Error(`missing ${r} user - run npm run seed`);
    return { id: u.id, displayName: u.display_name, role: u.role } as Actor;
  };
  const citizen = by("citizen"), helper = by("helper"), officer = by("officer");
  const profile = async (n: number) =>
    (await db<{ id: string }[]>`select id from public.citizen_profiles where demo_identity_id = ${`DEMO-WD-${String(n).padStart(3, "0")}`}`)[0].id;
  const [p1, p2, p3, p4, p5] = await Promise.all([1, 2, 3, 4, 5].map(profile));

  // clean slate for the profiles we touch (audit rows are append-only and stay)
  await db`delete from public.cases where citizen_profile_id = any(${[p1, p2, p3, p4, p5]}::uuid[])`;
  await db`delete from public.consent_records where citizen_profile_id = any(${[p1, p2, p3, p4, p5]}::uuid[])`;

  // ---------- consent is not implied by selection ----------
  check("helper cannot draft without consent (404)", await expectError(() => getOrCreateDraft(helper, p1), 404));
  check("grant requires witnessed acknowledgement (422)", await expectError(() => grantConsent(helper, p1, false), 422));

  // ---------- Branch A: DEMO-WD-001 via the citizen's own account ----------
  await grantConsent(citizen, p1, true);
  const caseA = await getOrCreateDraft(citizen, p1);
  check("draft creation is idempotent", (await getOrCreateDraft(citizen, p1)) === caseA);
  check("helper A without grant still cannot read citizen case (404)", await expectError(() => loadCaseForActor(helper, caseA), 404));
  const tplA = claimTemplateFor(1);
  await saveDraft(citizen, caseA, tplA);
  const resA = await submitCase(citizen, caseA, tplA);
  const viewA = await loadCaseForActor(citizen, caseA);
  check("A: confidence 0.92 -> MOCK_PAID with MOCK-RAAST ref", viewA.confidence === 0.92 && viewA.status === "MOCK_PAID" && /^MOCK-RAAST-/.test(viewA.mockPaymentRef ?? ""), `${viewA.confidence} ${viewA.status}`);
  const replay = await submitCase(citizen, caseA, tplA);
  const viewA2 = await loadCaseForActor(citizen, caseA);
  check("A: resubmit/refresh does not duplicate payout", "replay" in replay && replay.replay === true && viewA2.mockPaymentRef === viewA.mockPaymentRef);
  const [{ n: payCount }] = await db<{ n: number }[]>`select count(*)::int n from public.audit_logs where entity_id = ${caseA}::uuid and action = 'MOCK_PAYMENT_SIMULATED'`;
  check("A: exactly one MOCK_PAYMENT_SIMULATED audit event", payCount === 1);
  check("A: all hard gates pass", Object.values(viewA.hardGates).every(Boolean));

  // ---------- Branch B: DEMO-WD-004 via helper (assisted consent) ----------
  await grantConsent(helper, p4, true);
  const caseB = await getOrCreateDraft(helper, p4);
  await submitCase(helper, caseB, claimTemplateFor(4));
  const viewB = await loadCaseForActor(helper, caseB);
  check("B: confidence 0.73 -> MORE_PROOF, no payment", viewB.confidence === 0.73 && viewB.status === "MORE_PROOF" && !viewB.mockPaymentRef, `${viewB.confidence} ${viewB.status}`);
  check("B: specific proof requested", viewB.requestedProof.length > 0);

  // ---------- Branch C: DEMO-WD-002 -> officer ----------
  await grantConsent(helper, p2, true);
  const caseC = await getOrCreateDraft(helper, p2);
  await submitCase(helper, caseC, claimTemplateFor(2));
  const viewC = await loadCaseForActor(helper, caseC);
  check("C: confidence 0.44 -> OFFICER_REVIEW with literal 'I am not sure'", viewC.confidence === 0.44 && viewC.status === "OFFICER_REVIEW" && (viewC.reasonEn ?? "").startsWith("I am not sure"), `${viewC.confidence} ${viewC.status}`);
  check("C: no payment on handoff", !viewC.mockPaymentRef);
  const queue = await loadOfficerQueue(officer);
  check("C: appears in assigned officer's queue", queue.some((q) => q.id === caseC && !q.redacted));
  const oc = await loadOfficerCase(officer, caseC);
  check("C: officer sees deterministic notes + failed gates", oc.notes.length > 0 && oc.failedGates.includes("identityMatch"));
  check("officer decision requires a reason (422)", await expectError(() => officerDecide(officer, caseC, "approve", ""), 422));
  check("citizen role cannot officer-decide (403)", await expectError(() => officerDecide(citizen, caseC, "approve", "reason ok"), 403));
  await officerDecide(officer, caseC, "approve", "Synthetic demo: reviewed spelling and household.");
  const viewC2 = await loadCaseForActor(helper, caseC);
  check("C: officer approve -> OFFICER_APPROVED -> MOCK_PAID", viewC2.status === "MOCK_PAID" && /^MOCK-RAAST-/.test(viewC2.mockPaymentRef ?? ""));

  // ---------- Hard gate: duplicate + tamper never paid even if scored ----------
  await grantConsent(helper, p3, true);
  const caseD = await getOrCreateDraft(helper, p3);
  await submitCase(helper, caseD, claimTemplateFor(3));
  const viewD = await loadCaseForActor(helper, caseD);
  check("duplicate+tamper (DEMO-WD-003) -> OFFICER_REVIEW, never paid", viewD.status === "OFFICER_REVIEW" && !viewD.mockPaymentRef);

  // ---------- Withdrawal: immediate cross-role block, other family untouched ----------
  await grantConsent(helper, p5, true);
  const caseE = await getOrCreateDraft(helper, p5);
  const queueBefore = await loadOfficerQueue(officer);
  check("pre-withdraw: officer can see DEMO-WD-003 case", queueBefore.some((q) => q.id === caseD && !q.redacted));
  await withdrawConsent(helper, p3);
  check("withdraw: helper read of that case is denied (404)", await expectError(() => loadCaseForActor(helper, caseD), 404));
  check("withdraw: officer evidence access is denied (403/404)", (await expectError(() => loadOfficerCase(officer, caseD), 403)) || (await expectError(() => loadOfficerCase(officer, caseD), 404)));
  check("withdraw: officer cannot decide (403/404)", (await expectError(() => officerDecide(officer, caseD, "approve", "should be blocked"), 403)) || (await expectError(() => officerDecide(officer, caseD, "approve", "should be blocked"), 404)) || (await expectError(() => officerDecide(officer, caseD, "approve", "should be blocked"), 409)));
  check("withdraw: helper cannot save/submit that family (404)", await expectError(() => saveDraft(helper, caseD, claimTemplateFor(3)), 404));
  const [{ status: stD, mock_payment_ref: refD }] = await db<{ status: string; mock_payment_ref: string | null }[]>`select status, mock_payment_ref from public.cases where id = ${caseD}::uuid`;
  check("withdraw: case is CONSENT_WITHDRAWN and unpaid", stD === "CONSENT_WITHDRAWN" && refD === null);
  const queueAfter = await loadOfficerQueue(officer);
  check("withdraw: withdrawn case left the officer queue", !queueAfter.some((q) => q.id === caseD));
  check("withdraw: family 5 (other family) still usable", (await getOrCreateDraft(helper, p5)) === caseE);
  const ownerStillReads = await db`select 1 from public.cases where id = ${caseD}::uuid`;
  check("withdraw: row still exists for metadata/audit", ownerStillReads.length === 1);

  // ---------- Input safety ----------
  check("CNIC-shaped input is rejected without being stored (422)", await expectError(() => saveDraft(helper, caseE, { ...claimTemplateFor(5), claimedName: "Test 4210112345671" }), 422, "CNIC_LIKE_INPUT"));
  check("unexpected keys rejected (422)", await expectError(() => saveDraft(helper, caseE, { ...claimTemplateFor(5), role: "admin" }), 422));

  // ---------- Audit ----------
  const chain = await verifyAuditChain();
  check("audit hash chain verifies (recomputed SHA-256)", chain.ok, `${chain.checked} events, brokenAt=${chain.brokenAtId}`);
  check("audit UPDATE is rejected", await (async () => { try { await db`update public.audit_logs set action = 'X' where id = (select min(id) from public.audit_logs)`; return false; } catch { return true; } })());
  check("audit DELETE is rejected", await (async () => { try { await db`delete from public.audit_logs where id = (select min(id) from public.audit_logs)`; return false; } catch { return true; } })());
  const [{ n: leaks }] = await db<{ n: number }[]>`select count(*)::int n from public.audit_logs where metadata::text ~* '(Bibi|Khatoon|Begum|Bano|MOCK-RAAST-)'`;
  check("audit metadata holds no names or raw payment refs", leaks === 0);

  // ================= Slice C =================
  const { listConsentFor } = await import("../lib/services/consent-view");
  const { checkScam, reportFalseAlarm, scamMetrics, inspectDocument } = await import("../lib/services/scam");
  const { createDraft, updateDraft, publishInTx, listPolicies } = await import("../lib/services/policy");
  const { loadAuditorView } = await import("../lib/services/audit-view");
  const admin = by("admin"), auditor = by("auditor");

  // consent view + per-family isolation (helper toggles)
  await grantConsent(helper, p1, true); // helper grant for family 1 (citizen already granted platform)
  await grantConsent(helper, p2, true);
  check("consent view: helper sees live grants for own family", ((await listConsentFor(helper, p1)) ?? []).some((r) => !r.withdrawnAt));
  check("consent view: citizen owner sees own consent", ((await listConsentFor(citizen, p1)) ?? []).length > 0);
  const p6 = await profile(6);
  check("consent view: helper is neutral (null) for a family with no grant", (await listConsentFor(helper, p6)) === null);
  await withdrawConsent(citizen, p1);
  check("citizen withdrawal ends helper access for family 1 only", (await listConsentFor(helper, p1)) === null && ((await listConsentFor(helper, p2)) ?? []).some((r) => !r.withdrawnAt));
  check("citizen can still read own consent history after withdrawal", ((await listConsentFor(citizen, p1)) ?? []).some((r) => r.withdrawnAt));
  check("withdrawn family cannot create a draft (404)", await expectError(() => getOrCreateDraft(helper, p1), 404));
  const [{ n: wAudit }] = await db<{ n: number }[]>`select count(*)::int n from public.audit_logs where action = 'CONSENT_WITHDRAWN' and entity_id = ${p1}::uuid`;
  check("withdrawal wrote an audit event", wAudit >= 1);

  // scam checker
  const scam = await checkScam(citizen, { senderLabel: "Unknown", messageExcerpt: "Your DEMO relief Rs 12000 is ready; click https://example.invalid/claim and pay a fee" });
  check("scam: fee+link flagged LIKELY_SCAM with official sources attached", scam.verdict === "LIKELY_SCAM" && scam.sources.length >= 1 && scam.sources.every((x) => x.sourceType === "official_public"));
  check("scam: sources carry OFFICIAL label and BISP url", scam.sources.every((x) => /OFFICIAL PUBLIC/.test(x.label) && (x.url ?? "").includes("bisp.gov.pk")));
  check("scam: CNIC-shaped message rejected (422)", await expectError(() => checkScam(citizen, { senderLabel: "x", messageExcerpt: "id 4210112345671" }), 422, "CNIC_LIKE_INPUT"));
  check("scam: admin role cannot use checker (403)", await expectError(() => checkScam(admin, { senderLabel: "x", messageExcerpt: "hello" }), 403));
  check("scam: other user cannot report false alarm on my report (404)", await expectError(() => reportFalseAlarm(helper, scam.id, "not mine"), 404));
  await reportFalseAlarm(citizen, scam.id, "This was from my own family");
  const mt = await scamMetrics();
  check("scam: false-alarm metrics counted", mt.falseAlarms >= 1 && mt.total >= 1);
  const doc = await inspectDocument(citizen, { blurScore: 20, noiseInconsistency: 0.9, qrSupported: true, qrPayload: null, width: 300, height: 200 });
  check("document: blur/tamper flagged as potential issue, not fraud", doc.flags.includes("TAMPER_SUSPECTED") && /needs review/.test(doc.label));

  // admin rules: draft, immutability, publish v2 with v1 case staying pinned (publish is rolled back)
  const before = await listPolicies(admin);
  const v1row = before.find((r) => r.status === "active")!;
  const draftRules = { ...(v1row.rules as Record<string, unknown>), grant_amount_pkr: 20000 };
  check("admin: citizen cannot create policy (403)", await expectError(() => createDraft(citizen, draftRules), 403));
  check("admin: thresholds below baseline rejected (422)", await expectError(() => createDraft(admin, { ...draftRules, confidence_thresholds: { approve: 0.5, ask_proof: 0.6 } }), 422));
  const d = await createDraft(admin, draftRules);
  await updateDraft(admin, d.id, { ...draftRules, grant_amount_pkr: 21000 });
  check("admin: published rule content is immutable (DB trigger)", await (async () => { try { await db`update public.policy_rules set rules_json = '{}'::jsonb where id = ${v1row.id}::uuid`; return false; } catch { return true; } })());
  check("admin: updating an active version via service is refused (409)", await expectError(() => updateDraft(admin, v1row.id, draftRules), 409));
  await grantConsent(citizen, p1, true);
  const pinnedCase = await getOrCreateDraft(citizen, p1);
  await submitCase(citizen, pinnedCase, claimTemplateFor(1));
  const publishCheck = await db.begin(async (tx) => {
    const pub = await publishInTx(tx, admin, d.id);
    const [act] = await tx`select version from public.policy_rules where policy_key = 'RELIEF_GRANT_DEMO' and status = 'active'`;
    const [pc] = await tx`select pr.version from public.cases c join public.policy_rules pr on pr.id = c.policy_rule_id where c.id = ${pinnedCase}::uuid`;
    const [ev] = await tx`select count(*)::int n from public.audit_logs where action = 'POLICY_PUBLISHED' and entity_id = ${d.id}::uuid`;
    await tx`select 1`;
    const out = { newActive: act.version, caseVersion: pc.version, retired: pub.retiredVersion, audited: ev.n };
    throw Object.assign(new Error("ROLLBACK"), { out });
  }).catch((e) => (e as { out?: Record<string, number> }).out ?? null);
  check("admin: publish makes the new version active (no redeploy) and retires the old", !!publishCheck && publishCheck.newActive > v1row.version && publishCheck.retired === v1row.version, JSON.stringify(publishCheck));
  check("admin: existing case stays pinned to its original version after publish", !!publishCheck && publishCheck.caseVersion === v1row.version);
  check("admin: POLICY_PUBLISHED audit event written in same tx", !!publishCheck && publishCheck.audited === 1);
  const after = await listPolicies(admin);
  check("admin: rollback left original version active (demo state intact)", after.find((r) => r.status === "active")?.id === v1row.id);
  await db`delete from public.policy_rules where id = ${d.id}::uuid and status = 'draft'`;

  // auditor trace
  const av = await loadAuditorView(auditor, null);
  check("auditor: chain valid and events returned", av.chain.ok && av.events.length > 0);
  check("auditor: trace exposes factors, gates, policy version, model", av.traces.some((t) => t.policyVersion !== null && Object.keys(t.factorScores).length > 0 && /deterministic/.test(String((t.explanation as { modelVersion?: string }).modelVersion))));
  check("auditor: only auditors may view (403)", await expectError(() => loadAuditorView(admin, null), 403));
  check("auditor view leaks no names", !JSON.stringify(av.events.map((e) => e.metadata)).match(/Bibi|Khatoon|Begum|Bano/));

  void resA;
  if (!process.argv.includes("--keep")) {
    await db`delete from public.scam_reports`;
    await db`delete from public.cases where citizen_profile_id = any(${[p1, p2, p3, p4, p5]}::uuid[])`;
    await db`delete from public.consent_records where citizen_profile_id = any(${[p1, p2, p3, p4, p5]}::uuid[])`;
    console.log("(demo cases and consents reset; audit history retained — it is append-only)");
  }
  await db.end();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("verify failed:", e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
