"use client";

import { useState } from "react";

type Source = { id: string; label: string; title: string; url: string | null; excerpt: string };
type ScamResult = { id: string; verdict: string; confidence: number; signals: string[]; caveat: string; sources: Source[] };
type DocResult = { status: string; flags: string[]; qr: string; confidence: number; label: string; caveat: string };

const inputCls = "min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base";
const btn = "min-h-12 rounded-xl px-5 font-semibold";

const VERDICT_STYLE: Record<string, string> = {
  LIKELY_SCAM: "border-rose-400 bg-rose-50",
  UNCERTAIN: "border-amber-400 bg-amber-50",
  LIKELY_SAFE: "border-teal-400 bg-teal-50",
};
const VERDICT_TEXT: Record<string, string> = {
  LIKELY_SCAM: "⚠ Likely scam / ممکنہ دھوکہ",
  UNCERTAIN: "❓ Not sure / یقین نہیں",
  LIKELY_SAFE: "✓ Looks ordinary (not a guarantee) / عام لگتا ہے",
};

async function api<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.code ?? "ERROR");
  return j as T;
}

export function ScamChecker({ metrics }: { metrics: { total: number; falseAlarms: number; falseAlarmRate: number; flaggedLikelyScam: number } }) {
  const [sender, setSender] = useState("");
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<ScamResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fa, setFa] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true); setErr(null); setFa(null);
    try { setRes(await api<ScamResult>("/api/v1/scam/check", { senderLabel: sender, messageExcerpt: msg })); }
    catch (e) { setRes(null); setErr((e as Error).message); }
    setBusy(false);
  }
  async function falseAlarm() {
    if (!res) return;
    try { await api(`/api/v1/scam/${res.id}/false-alarm`, { reason: "User says this result is wrong" }); setFa("Thank you. Marked for human review."); }
    catch (e) { setFa(`Could not report (${(e as Error).message}).`); }
  }

  async function onFile(file: File | undefined) {
    setDoc(null); setErr(null);
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 2_000_000) { setErr("INVALID_FILE (PNG/JPEG under 2 MB, synthetic demo images only)"); return; }
    setBusy(true);
    try {
      const m = await analyzeImage(file); // runs in the browser; the image is never uploaded
      setDoc(await api<DocResult>("/api/v1/documents/inspect", m));
    } catch (e) { setErr((e as Error).message || "ANALYSIS_FAILED"); }
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">1. Check a message / پیغام چیک کریں</h2>
        <p className="mt-1 text-xs text-slate-600">Paste a SYNTHETIC example only. Never paste a real CNIC, phone number, PIN or bank detail. Links are never opened.</p>
        <div className="mt-4 space-y-3">
          <label className="block"><span className="mb-1 block text-sm font-semibold">Sender label</span>
            <input className={inputCls} maxLength={60} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="e.g. 8171 or Unknown" /></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">Message (max 280 characters)</span>
            <textarea className={`${inputCls} py-3`} rows={4} maxLength={280} value={msg} onChange={(e) => setMsg(e.target.value)}
              placeholder="Your DEMO relief Rs 12000 is ready; click https://example.invalid/claim and pay a fee" /></label>
          <button type="button" disabled={busy || !sender.trim() || !msg.trim()} onClick={check} className={`${btn} bg-teal-800 text-white disabled:opacity-50`}>Check</button>
          <button type="button" className={`${btn} ml-2 border border-slate-300`} onClick={() => { setSender("Unknown"); setMsg("Your DEMO relief Rs 12000 is ready; click https://example.invalid/claim and pay a fee today"); }}>Fill scam example</button>
          <button type="button" className={`${btn} ml-2 border border-slate-300`} onClick={() => { setSender("8171"); setMsg("Your payment centre appointment is on Monday. No fee is required."); }}>Fill harmless example</button>
        </div>
        {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">Could not complete ({err}).</p>}
        {res && (
          <div className={`mt-5 rounded-2xl border-2 p-4 ${VERDICT_STYLE[res.verdict]}`}>
            <p className="text-lg font-semibold">{VERDICT_TEXT[res.verdict]}</p>
            <p className="text-sm">Confidence in this label: {Math.round(res.confidence * 100)}% (uncalibrated heuristic)</p>
            <p className="mt-2 text-sm font-semibold">Signals found:</p>
            <ul className="flex flex-wrap gap-2 text-sm">{res.signals.map((s) => <li key={s} className="rounded-full bg-white px-3 py-1">{s}</li>)}</ul>
            <p className="mt-3 text-xs">{res.caveat}</p>
            <h3 className="mt-4 text-sm font-semibold">OFFICIAL PUBLIC ANTI-SCAM INFO (BISP public pages; does not certify this demo program)</h3>
            <ul className="mt-1 space-y-2 text-sm">
              {res.sources.map((s) => (
                <li key={s.id} className="rounded-xl bg-white p-3">
                  <p className="font-semibold">{s.title}</p><p className="italic">“{s.excerpt}”</p>
                  {s.url && <a className="text-xs text-teal-800 underline" href={s.url} rel="noopener noreferrer" target="_blank">{s.url}</a>}
                </li>
              ))}
            </ul>
            <button type="button" onClick={falseAlarm} className={`${btn} mt-4 border border-slate-400 bg-white`}>This is wrong — report false alarm</button>
            {fa && <p role="status" className="mt-2 text-sm">{fa}</p>}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-600">Running totals (all users): {metrics.total} checked, {metrics.flaggedLikelyScam} flagged likely scam, {metrics.falseAlarms} false alarms reported ({(metrics.falseAlarmRate * 100).toFixed(1)}%).</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">2. Check an ID image / تصویر چیک کریں</h2>
        <p className="mt-1 text-xs text-slate-600">Synthetic demo image only. Analysis happens in your browser; the picture is never uploaded. Only simple numbers are sent.</p>
        <input type="file" accept="image/png,image/jpeg" className="mt-3 block min-h-12" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose synthetic ID image" />
        {doc && (
          <div className={`mt-4 rounded-2xl border-2 p-4 ${doc.flags.length ? "border-amber-400 bg-amber-50" : "border-teal-400 bg-teal-50"}`}>
            <p className="text-lg font-semibold">{doc.label}</p>
            <p className="text-sm">Result: {doc.status} · QR: {doc.qr} · confidence {Math.round(doc.confidence * 100)}%</p>
            {doc.flags.length > 0 && <p className="text-sm">Flags: {doc.flags.join(", ")}</p>}
            <p className="mt-2 text-xs">{doc.caveat}</p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Laplacian-variance blur, block noise inconsistency, optional QR decode via BarcodeDetector. */
async function analyzeImage(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 320 / bmp.width);
  const w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const lap = new Float32Array(w * h);
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x];
    lap[y * w + x] = Math.abs(v); sum += v; sumSq += v * v; n++;
  }
  const blurScore = sumSq / n - (sum / n) ** 2;
  const B = 4, energies: number[] = [];
  for (let by = 0; by < B; by++) for (let bx = 0; bx < B; bx++) {
    let e = 0, c = 0;
    for (let y = Math.floor((by * h) / B) + 1; y < Math.floor(((by + 1) * h) / B) - 1; y++)
      for (let x = Math.floor((bx * w) / B) + 1; x < Math.floor(((bx + 1) * w) / B) - 1; x++) { e += lap[y * w + x]; c++; }
    energies.push(c ? e / c : 0);
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const sd = Math.sqrt(energies.reduce((a, b) => a + (b - mean) ** 2, 0) / energies.length);
  const noiseInconsistency = mean > 0 ? Math.min(1, sd / mean / 2) : 0;

  let qrSupported = false, qrPayload: string | null = null;
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(i: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (BD) {
    qrSupported = true;
    try { const found = await new BD({ formats: ["qr_code"] }).detect(bmp); qrPayload = found[0]?.rawValue?.slice(0, 100) ?? null; } catch { qrSupported = false; }
  }
  return { blurScore: Math.round(blurScore * 100) / 100, noiseInconsistency: Math.round(noiseInconsistency * 1000) / 1000, qrSupported, qrPayload, width: bmp.width, height: bmp.height };
}
