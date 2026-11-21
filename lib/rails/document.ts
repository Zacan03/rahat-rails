import { z } from "zod";

/** Metrics are computed in the browser; the image itself never leaves the device. */
export const DocMetricsSchema = z
  .object({
    blurScore: z.number().min(0).max(1_000_000), // Laplacian variance
    noiseInconsistency: z.number().min(0).max(1),
    qrSupported: z.boolean(),
    qrPayload: z.string().max(100).nullable(),
    width: z.number().int().min(1).max(20000),
    height: z.number().int().min(1).max(20000),
  })
  .strict();
export type DocMetrics = z.infer<typeof DocMetricsSchema>;

export const BLUR_THRESHOLD = 100;
export const TAMPER_THRESHOLD = 0.6;

export function inspectDocumentMetrics(m: DocMetrics) {
  const flags: string[] = [];
  if (m.blurScore < BLUR_THRESHOLD) flags.push("BLURRY");
  if (m.noiseInconsistency > TAMPER_THRESHOLD) flags.push("TAMPER_SUSPECTED");
  let qr: "QR_VALID_DEMO" | "QR_INVALID" | "QR_NOT_FOUND" | "QR_UNCHECKED";
  if (!m.qrSupported) qr = "QR_UNCHECKED";
  else if (m.qrPayload === null) qr = "QR_NOT_FOUND";
  else qr = /^DEMO-[A-Z0-9-]+$/.test(m.qrPayload) ? "QR_VALID_DEMO" : "QR_INVALID";
  if (qr === "QR_INVALID" || qr === "QR_NOT_FOUND") flags.push(qr);

  // Honest, deliberately modest confidence: these are crude image statistics.
  const confidence = flags.includes("TAMPER_SUSPECTED") ? 0.55 : flags.length ? 0.65 : 0.5;
  const status = flags.includes("TAMPER_SUSPECTED")
    ? "TAMPER_SUSPECTED"
    : flags.includes("BLURRY")
      ? "BLURRY"
      : flags.length
        ? "NEEDS_REVIEW"
        : "NO_ISSUE_FOUND";
  return {
    status,
    flags,
    qr,
    confidence,
    label: flags.length ? "Potential issue — needs review (not proof of fraud)" : "No issue found by simple checks (not a guarantee)",
    caveat: "Simple blur / noise / QR statistics on a synthetic demo image. Not forensic analysis; false alarms and misses are expected.",
  };
}
