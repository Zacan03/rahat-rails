"use client";

import { useEffect, useState, useTransition } from "react";
import { Speak, Dictate } from "@/components/voice/voice";
import { useRouter } from "next/navigation";
import { saveDraftAction, submitClaimAction } from "@/app/citizen/claim/actions";
import { T, type Lang } from "@/lib/i18n/strings";

export type Answers = {
  claimedName: string | null;
  ageYears: number | null;
  householdSize: number | null;
  householdIncomePkr: number | null;
  district: string | null;
  widowAttested: boolean;
  proofs: string[];
};

type SaveState = "saved" | "saving" | "retry" | "idle";

const inputCls =
  "min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";
const btnCls =
  "min-h-12 rounded-xl px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

type ClaimField = {
  label: { ur: string; en: string };
  prompt: { ur: string; en: string };
  required: boolean;
};

const claimFields = {
  name: { label: T.name, prompt: T.namePrompt, required: true },
  age: { label: T.age, prompt: T.agePrompt, required: true },
  widow: { label: T.widow, prompt: T.widowPrompt, required: true },
  household: { label: T.household, prompt: T.householdPrompt, required: true },
  income: { label: T.income, prompt: T.incomePrompt, required: true },
  district: { label: T.district, prompt: T.districtPrompt, required: true },
  proofDemoId: { label: T.proofDemoId, prompt: T.proofPrompt, required: true },
  proofWidow: { label: T.proofWidow, prompt: T.proofPrompt, required: true },
} satisfies Record<string, ClaimField>;

function fieldSpeech(field: ClaimField, lang: Lang) {
  const required = field.required ? T.required[lang] : T.optional[lang];
  return lang === "ur"
    ? `${field.label.ur}۔ ${field.prompt.ur} ${required}`
    : `${field.label.en}. ${field.prompt.en}. ${required}`;
}

function FieldSpeaker({ field, lang }: { field: ClaimField; lang: Lang }) {
  return (
    <Speak
      text={fieldSpeech(field, "en")}
      urText={fieldSpeech(field, "ur")}
      language={lang}
      compact
      ariaLabel={`Listen to ${field.label[lang]} in ${lang === "ur" ? "Urdu" : "English"}`}
    />
  );
}

function FieldLabel({
  id,
  field,
  lang,
}: {
  id: string;
  field: ClaimField;
  lang: Lang;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label htmlFor={id} className="font-semibold">{field.label[lang]}</label>
      <FieldSpeaker field={field} lang={lang} />
    </div>
  );
}

/**
 * Guided claim. Server is the source of truth: each step autosaves to the server draft and
 * the real save state is shown. Nothing sensitive is written to localStorage/URL.
 * Keyed by profile id by the parent, so switching family discards all form state.
 */
export function ClaimWizard(props: {
  caseId: string;
  initial: Answers;
  template: Answers | null;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(props.initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = (p: { ur: string; en: string }) => p[lang];
  const key = `rr:progress:${props.caseId}`;

  // Opaque, non-sensitive progress only: step number + a sync flag. Answers stay in memory/server.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) { const p = JSON.parse(raw) as { step?: number }; if (typeof p.step === "number" && p.step >= 0 && p.step <= 3) setStep(p.step); }
    } catch { /* storage unavailable: fine */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function remember(nextStep: number, pendingSync: boolean) {
    try { window.localStorage.setItem(key, JSON.stringify({ step: nextStep, pendingSync })); } catch { /* ignore */ }
  }
  useEffect(() => {
    const retryOnline = () => { if (save === "retry") void persist(a); };
    window.addEventListener("online", retryOnline);
    return () => window.removeEventListener("online", retryOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, a]);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((s) => ({ ...s, [k]: v }));

  async function persist(next: Answers): Promise<boolean> {
    setSave("saving");
    try {
      const r = await saveDraftAction(props.caseId, next);
      if (r.ok) {
        remember(step, false);
        setSave("saved");
        setError(null);
        return true;
      }
      setSave("retry");
      setError(r.code);
      return false;
    } catch {
      remember(step, true);
      setSave("retry"); // weak network: plain, idempotent retry
      setError("NETWORK");
      return false;
    }
  }

  const goNext = () => startTransition(async () => { if (await persist(a)) { const n = Math.min(3, step + 1); remember(n, false); setStep(n); } });
  const submit = () =>
    startTransition(async () => {
      try {
        const r = await submitClaimAction(props.caseId, a);
        if (r.ok) router.push(`/citizen/cases/${props.caseId}`);
        else { setSave("retry"); setError(r.code); }
      } catch {
        setSave("retry");
        setError("NETWORK");
      }
    });

  const toggleProof = (p: string) =>
    set("proofs", a.proofs.includes(p) ? a.proofs.filter((x) => x !== p) : [...a.proofs, p]);

  const saveLabel =
    save === "saved" ? T.saved : save === "saving" ? T.saving : save === "retry" ? T.waiting : null;

  const unfilledPrompts: ClaimField[] = [];
  if (step === 0) {
    if (!a.claimedName?.trim()) unfilledPrompts.push(claimFields.name);
    if (a.ageYears === null) unfilledPrompts.push(claimFields.age);
    if (!a.widowAttested) unfilledPrompts.push(claimFields.widow);
  } else if (step === 1) {
    if (a.householdSize === null) unfilledPrompts.push(claimFields.household);
    if (a.householdIncomePkr === null) unfilledPrompts.push(claimFields.income);
    if (!a.district) unfilledPrompts.push(claimFields.district);
  } else if (step === 2) {
    if (!a.proofs.includes("DEMO_ID")) unfilledPrompts.push(claimFields.proofDemoId);
    if (!a.proofs.includes("WIDOWHOOD_ATTESTATION")) unfilledPrompts.push(claimFields.proofWidow);
  }
  const missingEnglish = unfilledPrompts.map((field) => fieldSpeech(field, "en")).join(" ");
  const missingUrdu = unfilledPrompts.map((field) => fieldSpeech(field, "ur")).join("، ");
  const voiceText = [
    `Step ${step + 1}: ${T.stepNames[step].en}.`,
    T.stepInstructions[step].en,
    missingEnglish ? `Please complete these fields: ${missingEnglish}.` : "",
    T.disclaimer.en,
  ].filter(Boolean).join(" ");
  const voiceUrText = [
    `مرحلہ ${step + 1}: ${T.stepNames[step].ur}۔`,
    T.stepInstructions[step].ur,
    missingUrdu ? `براہ کرم یہ خالی خانے مکمل کریں: ${missingUrdu}۔` : "",
    T.disclaimer.ur,
  ].filter(Boolean).join(" ");

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8" dir={lang === "ur" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex gap-2" aria-label="Steps">
          {T.stepNames.map((s, i) => (
            <li
              key={i}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${i === step ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {i + 1}. {t(s)}
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setLang(lang === "ur" ? "en" : "ur")} className={`${btnCls} border border-slate-300 bg-white`}>
          {lang === "ur" ? "English" : "اردو"}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-600">{t(T.disclaimer)}</p>
      <div className="mt-3 space-y-2">
        <p className="text-sm text-slate-700">{t(T.stepInstructions[step])}</p>
        <Speak
          text={voiceText}
          urText={voiceUrText}
          language={lang}
          buttonLabel={t(T.readAloud)}
          ariaLabel={`Read this step aloud in ${lang === "ur" ? "Urdu" : "English"}`}
        />
      </div>

      {props.template && (
        <button type="button" onClick={() => setA(props.template!)} className="mt-4 text-sm font-semibold text-teal-800 underline">
          {t(T.demoAnswers)}
        </button>
      )}

      <div className="mt-6 space-y-5">
        {step === 0 && (
          <>
            <div className="block">
              <FieldLabel id="claim-name" field={claimFields.name} lang={lang} />
              <input id="claim-name" className={inputCls} maxLength={120} value={a.claimedName ?? ""} onChange={(e) => set("claimedName", e.target.value || null)} autoComplete="off" placeholder={t(claimFields.name.prompt)} />
              <span className="mt-1 block text-xs text-slate-500">DEMO-… only. Never type a real CNIC or phone number.</span>
            </div>
            <Dictate label="Speak name (Urdu)" onConfirm={(txt) => set("claimedName", txt)} />
            <div className="block">
              <FieldLabel id="claim-age" field={claimFields.age} lang={lang} />
              <input id="claim-age" className={inputCls} inputMode="numeric" value={a.ageYears ?? ""} onChange={(e) => set("ageYears", numOrNull(e.target.value))} placeholder={t(claimFields.age.prompt)} />
            </div>
            <div className="flex min-h-12 items-center gap-2">
              <label htmlFor="claim-widow" className="flex items-center gap-3 font-semibold">
                <input id="claim-widow" type="checkbox" className="size-6" checked={a.widowAttested} onChange={(e) => set("widowAttested", e.target.checked)} />
                {t(claimFields.widow.label)}
              </label>
              <FieldSpeaker field={claimFields.widow} lang={lang} />
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="block">
              <FieldLabel id="claim-household" field={claimFields.household} lang={lang} />
              <input id="claim-household" className={inputCls} inputMode="numeric" value={a.householdSize ?? ""} onChange={(e) => set("householdSize", numOrNull(e.target.value))} placeholder={t(claimFields.household.prompt)} />
            </div>
            <div className="block">
              <FieldLabel id="claim-income" field={claimFields.income} lang={lang} />
              <input id="claim-income" className={inputCls} inputMode="numeric" value={a.householdIncomePkr ?? ""} onChange={(e) => set("householdIncomePkr", numOrNull(e.target.value))} placeholder={t(claimFields.income.prompt)} />
            </div>
            <div className="block">
              <FieldLabel id="claim-district" field={claimFields.district} lang={lang} />
              <select id="claim-district" className={inputCls} value={a.district ?? ""} onChange={(e) => set("district", e.target.value || null)}>
                <option value="">{t(claimFields.district.prompt)}</option>
                <option value="KARACHI_DEMO">KARACHI_DEMO</option>
                <option value="OTHER_DEMO">OTHER_DEMO</option>
              </select>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            {([
              ["DEMO_ID", claimFields.proofDemoId],
              ["WIDOWHOOD_ATTESTATION", claimFields.proofWidow],
            ] as const).map(([code, field]) => (
              <div key={code} className="flex min-h-12 items-center gap-2">
                <label htmlFor={`claim-proof-${code}`} className="flex items-center gap-3 font-semibold">
                  <input id={`claim-proof-${code}`} type="checkbox" className="size-6" checked={a.proofs.includes(code)} onChange={() => toggleProof(code)} />
                  {t(field.label)}
                </label>
                <FieldSpeaker field={field} lang={lang} />
              </div>
            ))}
          </>
        )}
        {step === 3 && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <dt className="font-semibold">{t(T.name)}</dt><dd>{a.claimedName ?? "—"}</dd>
            <dt className="font-semibold">{t(T.age)}</dt><dd>{a.ageYears ?? "—"}</dd>
            <dt className="font-semibold">{t(T.household)}</dt><dd>{a.householdSize ?? "—"}</dd>
            <dt className="font-semibold">{t(T.income)}</dt><dd>{a.householdIncomePkr ?? "—"}</dd>
            <dt className="font-semibold">{t(T.district)}</dt><dd>{a.district ?? "—"}</dd>
            <dt className="font-semibold">{t(T.widow)}</dt><dd>{a.widowAttested ? "✓" : "✗"}</dd>
            <dt className="font-semibold">Proofs</dt><dd>{a.proofs.join(", ") || "—"}</dd>
          </dl>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" className={`${btnCls} border border-slate-300 bg-white`} onClick={() => setStep(step - 1)}>
            {t(T.back)}
          </button>
        )}
        {step < 3 ? (
          <button type="button" disabled={pending} className={`${btnCls} bg-teal-800 text-white`} onClick={goNext}>
            {t(T.next)}
          </button>
        ) : (
          <button type="button" disabled={pending} className={`${btnCls} bg-teal-800 text-white`} onClick={submit}>
            {t(T.submit)}
          </button>
        )}
        <span aria-live="polite" className="text-sm text-slate-700">
          {saveLabel ? t(saveLabel) : null}
        </span>
        {save === "retry" && (
          <button type="button" className="text-sm font-semibold text-teal-800 underline" onClick={() => (step === 3 ? submit() : goNext())}>
            {t(T.retry)}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error === "CNIC_LIKE_INPUT"
            ? "That looks like a real ID number. Real CNICs are not allowed — remove it."
            : error === "CONSENT_REQUIRED"
              ? "Consent is no longer active for this family. Nothing was saved or processed."
              : `Could not complete this step (${error}). You can retry safely.`}
        </p>
      )}
    </section>
  );
}
