import { NextRequest, NextResponse } from "next/server";
import {
  createMainAppSessionCookie,
  exchangeMainAppSsoTicket,
  getMainAppSessionCookieName,
  getMainAppSessionCookieOptions,
  getPublicShuzirenAppUrl,
} from "@/lib/main-app-sso";

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket")?.trim();
  if (!ticket) {
    return NextResponse.json({ error: "SSO ticket is required." }, { status: 400 });
  }

  try {
    const { redirectPath, session } = await exchangeMainAppSsoTicket(ticket);
    const redirectUrl = new URL(redirectPath, getPublicShuzirenAppUrl());
    const response = NextResponse.redirect(redirectUrl);
    
    response.cookies.set(
      getMainAppSessionCookieName(),
      await createMainAppSessionCookie(session),
      getMainAppSessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: "Main-site SSO exchange failed: " + (error?.message || "Unknown error") },
      { status: 401 },
    );
  }
}
