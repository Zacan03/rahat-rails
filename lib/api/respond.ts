import "server-only";

import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { AuthorizationError } from "@/lib/auth/roles";

const HEADERS = { "Cache-Control": "private, no-store" };

export function ok(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

/** {error:{code,message,correlationId}} envelope; never leaks internals. */
export function fail(e: unknown) {
  let status = 503;
  let code = "SERVICE_ERROR";
  if (e instanceof AppError) { status = e.status; code = e.code; }
  else if (e instanceof AuthorizationError) { status = e.statusCode; code = e.code; }
  return Response.json(
    { error: { code, message: code.toLowerCase().replace(/_/g, " "), correlationId: randomUUID() } },
    { status, headers: HEADERS },
  );
}
