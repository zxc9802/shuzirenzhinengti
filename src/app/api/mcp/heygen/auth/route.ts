import { NextRequest, NextResponse } from "next/server";
import { HeyGenDirectMcpProvider } from "@/lib/mcp/heygen-provider";
import { saveAppConfig } from "@/lib/config";
import { getHeyGenOAuthStatus } from "@/lib/mcp/heygen-remote";

export async function GET() {
  const oauth = getHeyGenOAuthStatus();
  if (oauth.connected && oauth.user) {
    return NextResponse.json({
      success: true,
      quota: oauth.user.quota,
      remainingQuota: oauth.user.remainingCredits,
      planName: oauth.user.planName,
      source: "oauth",
      email: oauth.user.email,
    });
  }

  const result = await HeyGenDirectMcpProvider.getQuota();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, baseUrl } = body;

    if (token !== undefined) {
      saveAppConfig({
        heygenApiKey: token.trim(),
        heygenApiBaseUrl: baseUrl?.trim() || "https://api.heygen.com",
      });
    }

    const quotaResult = await HeyGenDirectMcpProvider.getQuota();
    return NextResponse.json(quotaResult);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "认证请求失败" }, { status: 500 });
  }
}
