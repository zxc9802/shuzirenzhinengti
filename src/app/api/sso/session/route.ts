import { NextRequest, NextResponse } from "next/server";
import {
  getMainAppSessionCookieName,
  getMainAppSessionCookieOptions,
  readMainAppSessionCookie,
  validateMainAppSession,
  fetchMainAppUserProfile,
  isSsoConfigured,
} from "@/lib/main-app-sso";
import {
  isExternallyBilledUser,
  POINTS_PER_SECOND,
  CNY_PER_SECOND,
} from "@/lib/main-app-billing";

export async function GET(request: NextRequest) {
  if (!isSsoConfigured()) {
    // If SSO is not configured (local dev mode), return mock user
    const devUser = {
      id: "local_dev_user",
      account: "admin@qycm.top",
      nickname: "本地开发者",
      role: "admin",
      billingAudience: "internal",
      pointsBalance: 99999,
    };
    return NextResponse.json({
      success: true,
      data: {
        user: devUser,
        devMode: true,
        billing: {
          ratePerSecond: POINTS_PER_SECOND,
          cnyPerSecond: CNY_PER_SECOND,
          isExternal: isExternallyBilledUser(devUser),
        },
      },
    });
  }

  const session = await readMainAppSessionCookie(
    request.cookies.get(getMainAppSessionCookieName())?.value,
  );
  if (session && (await validateMainAppSession(session))) {
    // Try to fetch latest live points balance from main app
    const liveProfile = await fetchMainAppUserProfile(session.token);
    const user = {
      ...session.user,
      ...liveProfile,
    };
    const isExternal = isExternallyBilledUser(user);

    return NextResponse.json({
      success: true,
      data: {
        user,
        billing: {
          ratePerSecond: POINTS_PER_SECOND,
          cnyPerSecond: CNY_PER_SECOND,
          isExternal,
        },
      },
    });
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

