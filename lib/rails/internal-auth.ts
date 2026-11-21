import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Server-to-server guard for /api/mock/*. Fails closed when the secret is unset.
 * Holding this key never bypasses case authorization or live consent (checked per route).
 */
export function checkInternalKey(request: Request): "ok" | "unauthorized" | "unavailable" {
  const secret = process.env.INTERNAL_MOCK_SECRET;
  if (!secret) return "unavailable";
  const provided = request.headers.get("x-internal-mock-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "unauthorized";
  return "ok";
}

export function mockJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Prototype-Only": "SIMULATED DATA - NO REAL MONEY" },
  });
}

export function mockError(status: number, code: string) {
  return mockJson({ error: { code } }, status);
}
