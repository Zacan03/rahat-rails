/**
 * Deterministic scam-signal classifier. Output is an UNCERTAINTY label, never proof of fraud.
 * Message text is untrusted data: instructions inside it are never followed, links never fetched.
 */
export type ScamSignal =
  | "FEE_REQUEST" | "LINK" | "IMPERSONATION" | "URGENCY" | "CREDENTIAL_REQUEST"
  | "UNKNOWN_SENDER" | "INJECTION_ATTEMPT";

export type ScamVerdict = "LIKELY_SCAM" | "UNCERTAIN" | "LIKELY_SAFE";

const RULES: { signal: ScamSignal; weight: number; re: RegExp }[] = [
  { signal: "FEE_REQUEST", weight: 0.35, re: /\b(fee|fees|charges?|processing|deposit|advance|pay now|send (money|rs)|easypaisa|jazzcash)\b|فیس|رقم جمع/i },
  { signal: "LINK", weight: 0.25, re: /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|xyz|invalid|top|info|link)\b)/i },
  { signal: "CREDENTIAL_REQUEST", weight: 0.3, re: /\b(pin|otp|password|cvv|card number|cnic number|account number)\b/i },
  { signal: "URGENCY", weight: 0.1, re: /\b(urgent|immediately|today only|within \d+ ?(hours?|hrs?)|last chance|expires?)\b|فوری/i },
  { signal: "IMPERSONATION", weight: 0.1, re: /\b(bisp|benazir|nadra|government|ehsaas|relief (fund|payment)|grant)\b|بینظیر|حکومت/i },
  { signal: "INJECTION_ATTEMPT", weight: 0, re: /(ignore (all |any )?(previous|prior) instructions|system prompt|you are now|approve (this|my) (case|claim))/i },
];

export const CNIC_LIKE = /\d{5}-?\d{7}-?\d/;

export function classifyScam(senderLabel: string, message: string) {
  const signals: ScamSignal[] = [];
  let score = 0;
  for (const r of RULES) {
    if (r.re.test(message)) {
      signals.push(r.signal);
      score += r.weight;
    }
  }
  // A sender string saying "8171" proves nothing: sender IDs can be spoofed.
  const official = /^8171$/.test(senderLabel.trim());
  if (!official) {
    signals.push("UNKNOWN_SENDER");
    score += 0.05;
  }
  const strong = signals.filter((s) => s === "FEE_REQUEST" || s === "LINK" || s === "CREDENTIAL_REQUEST").length;
  const contentSignals = signals.filter((x) => x !== "UNKNOWN_SENDER");
  let verdict: ScamVerdict;
  if (score >= 0.6 || strong >= 2) verdict = "LIKELY_SCAM";
  else if (contentSignals.length === 0 && official) verdict = "LIKELY_SAFE"; // clean content AND official-looking sender; still spoofable
  else verdict = "UNCERTAIN";

  // Confidence in the LABEL (uncalibrated heuristic): modest by design, capped below certainty.
  const confidence =
    verdict === "LIKELY_SCAM" ? Math.round(Math.min(0.9, 0.5 + score / 2) * 100) / 100 : verdict === "LIKELY_SAFE" ? 0.6 : 0.5;

  return {
    verdict,
    confidence,
    signals,
    caveat:
      "Heuristic signal check only. It cannot verify who really sent a message and may be wrong. Official BISP messages come only from 8171; never pay a fee or share a PIN. Report doubts to an officer.",
  };
}
