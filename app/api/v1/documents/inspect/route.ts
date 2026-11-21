import { requireVerifiedActor } from "@/lib/auth/server";
import { inspectDocument } from "@/lib/services/scam";
import { fail, ok } from "@/lib/api/respond";

export async function POST(request: Request) {
  try {
    const actor = await requireVerifiedActor();
    return ok(await inspectDocument(actor, await request.json().catch(() => null)));
  } catch (e) {
    return fail(e);
  }
}
