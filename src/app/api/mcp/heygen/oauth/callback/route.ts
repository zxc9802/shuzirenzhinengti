import { NextRequest, NextResponse } from "next/server";
import {
  buildHeyGenCallbackUrl,
  loadHeyGenOAuthStore,
  resolveRequestOrigin,
} from "@/lib/mcp/heygen-oauth-store";
import { finishHeyGenOAuth } from "@/lib/mcp/heygen-remote";

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
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (error) {
    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: errorDescription || error,
    });
  }

  if (!code) {
    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: "授权回调缺少 code",
    });
  }

  const storedState = loadHeyGenOAuthStore().oauthState;
  if (storedState && state && storedState !== state) {
    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: "授权状态校验失败，请重新点击连接",
    });
  }

  try {
    await finishHeyGenOAuth(code, buildHeyGenCallbackUrl(resolveRequestOrigin(req)));
    return mcpRedirect(req, { heygen_oauth: "success" });
  } catch (err: any) {
    return mcpRedirect(req, {
      heygen_oauth: "error",
      message: err?.message || "HeyGen 授权完成失败",
    });
  }
}
