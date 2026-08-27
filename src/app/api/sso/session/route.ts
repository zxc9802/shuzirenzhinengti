import { NextRequest, NextResponse } from "next/server";
import {
  getMainAppSessionCookieName,
  getMainAppSessionCookieOptions,
  readMainAppSessionCookie,
  validateMainAppSession,
  isSsoConfigured,
} from "@/lib/main-app-sso";

export async function GET(request: NextRequest) {
  if (!isSsoConfigured()) {
    // If SSO is not configured (local dev mode), return mock user
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: "local_dev_user",
          account: "admin@qycm.top",
          nickname: "本地开发者",
          role: "admin",
        },
        devMode: true,
      },
    });
  }

  const session = await readMainAppSessionCookie(
    request.cookies.get(getMainAppSessionCookieName())?.value,
  );
  if (session && (await validateMainAppSession(session))) {
    return NextResponse.json({ success: true, data: { user: session.user } });
  }

  const response = NextResponse.json(
    { error: "Main-site session is invalid." },
    { status: 401 },
  );
  response.cookies.set(getMainAppSessionCookieName(), "", {
    ...getMainAppSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
