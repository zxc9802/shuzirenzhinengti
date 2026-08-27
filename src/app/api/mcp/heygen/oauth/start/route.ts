import { NextRequest, NextResponse } from "next/server";
import {
  buildHeyGenCallbackUrl,
  resolveRequestOrigin,
} from "@/lib/mcp/heygen-oauth-store";
import { startHeyGenOAuth } from "@/lib/mcp/heygen-remote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mcpRedirect(req: NextRequest, query: Record<string, string>) {
  const url = new URL("/mcp", resolveRequestOrigin(req));
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  try {
    const origin = resolveRequestOrigin(req);
    const result = await startHeyGenOAuth(buildHeyGenCallbackUrl(origin));

    if (result.connected) {
      return mcpRedirect(req, { heygen_oauth: "already" });
    }

    if (result.authorizationUrl) {
      return NextResponse.redirect(result.authorizationUrl);
    }

    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: result.error || "未能发起 HeyGen 授权",
    });
  } catch (err: any) {
    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: err?.message || "发起 HeyGen MCP 授权失败",
    });
  }
}
