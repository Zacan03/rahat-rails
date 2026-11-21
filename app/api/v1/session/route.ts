import { requireVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";

export async function GET() {
  try {
    const actor = await requireVerifiedActor();

    return Response.json(
      {
        actor: {
          id: actor.id,
          displayName: actor.displayName,
          role: actor.role,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: { code: error.code } },
        {
          status: error.statusCode,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    throw error;
  }
}
