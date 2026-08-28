import { NextResponse, type NextRequest } from "next/server";
import {
  getMainAppSessionCookieName,
  getMainAppSessionCookieOptions,
  getMainAppSsoLaunchUrl,
  readMainAppSessionCookie,
  validateMainAppSession,
  isSsoConfigured,
} from "@/lib/main-app-sso";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Whitelist static files, SSO callback, and public endpoints
  if (
    pathname === "/api/sso/callback" ||
    pathname === "/api/sso/diagnose" ||
    pathname.startsWith("/api/mcp/heygen/oauth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/api/tasks/") && pathname.includes("/download/") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // 2. If SSO is not enabled/configured (e.g. local dev mode without secrets), allow through
  if (!isSsoConfigured()) {
    return NextResponse.next();
  }

  // 3. Check SSO session
  const cookieValue = request.cookies.get(getMainAppSessionCookieName())?.value;
  const session = await readMainAppSessionCookie(cookieValue);

  if (session && (await validateMainAppSession(session))) {
    // Session is valid
    const response = NextResponse.next();
    response.headers.set("x-user-id", session.user.id);
    response.headers.set("x-user-account", session.user.account);
    return response;
  }

  // 4. Session invalid or missing
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.json(
      { error: "Main-site session is invalid or expired." },
      { status: 401 },
    );
    response.cookies.set(getMainAppSessionCookieName(), "", {
      ...getMainAppSessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  }

  // 5. Page route: redirect to main app launch URL
  const response = NextResponse.redirect(getMainAppSsoLaunchUrl());
  response.cookies.set(getMainAppSessionCookieName(), "", {
    ...getMainAppSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
