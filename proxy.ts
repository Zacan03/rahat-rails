import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/auth/config";

export async function proxy(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const invalidSession =
    error?.name === "AuthSessionMissingError" ||
    error?.status === 400 ||
    error?.status === 401;

  if (error && !invalidSession) {
    return NextResponse.json(
      { error: { code: "AUTH_UNAVAILABLE" } },
      { status: 503 },
    );
  }

  if (
    /^\/(dashboard|citizen|helper|officer|admin|auditor|scam-check)(\/|$)/.test(request.nextUrl.pathname) &&
    !data.user
  ) {
    const redirectResponse = NextResponse.redirect(
      new URL("/login", request.url),
    );
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/citizen/:path*",
    "/helper/:path*",
    "/officer/:path*",
    "/admin/:path*",
    "/auditor/:path*",
    "/scam-check",
    "/api/v1/:path*",
  ],
};
