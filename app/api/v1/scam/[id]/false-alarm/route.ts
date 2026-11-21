import { requireVerifiedActor } from "@/lib/auth/server";
import { reportFalseAlarm } from "@/lib/services/scam";
import { fail, ok } from "@/lib/api/respond";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireVerifiedActor();
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    return ok(await reportFalseAlarm(actor, id, body?.reason));
  } catch (e) {
    return fail(e);
  }
}
