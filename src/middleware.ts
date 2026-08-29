import { NextResponse, type NextRequest } from "next/server";
import {
  getMainAppSessionCookieName,
  getMainAppSessionCookieOptions,
  getMainAppSsoLaunchUrl,
  isMainAppSessionWithinValidationGrace,
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
  if (cookieValue && !session) {
    console.error("[SSO] Local session cookie could not be decrypted or was expired.");
  }
  const sessionValidation = session
    ? await validateMainAppSession(session)
    : "invalid";

  if (session && sessionValidation === "valid") {
    // Session is valid
    const response = NextResponse.next();
    response.headers.set("x-user-id", session.user.id);
    response.headers.set("x-user-account", session.user.account);
    return response;
  }

  // 4. Main site temporarily unavailable
  if (sessionValidation === "unavailable") {
    if (session && isMainAppSessionWithinValidationGrace(session)) {
      const response = NextResponse.next();
      response.headers.set("x-user-id", session.user.id);
      response.headers.set("x-user-account", session.user.account);
      response.headers.set("x-sso-validation", "grace");
      return response;
    }

    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Main site is temporarily unavailable. Please retry shortly." },
        {
          status: 503,
          headers: { "Retry-After": "3", "Cache-Control": "no-store" },
        },
      );
    }

    return new NextResponse(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>主站暂时不可用</title><body><h1>主站暂时不可用</h1><p>登录状态已保留，请稍后刷新页面。</p></body></html>`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": "3",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // 5. Session invalid or missing
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

  // 6. Page route: redirect to main app launch URL
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
