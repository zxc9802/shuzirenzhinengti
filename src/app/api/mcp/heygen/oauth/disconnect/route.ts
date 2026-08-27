import { NextResponse } from "next/server";
import { disconnectHeyGenOAuth } from "@/lib/mcp/heygen-remote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    await disconnectHeyGenOAuth();
    return NextResponse.json({ success: true, connected: false, needsAuth: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "断开 HeyGen MCP 失败" },
      { status: 500 }
    );
  }
}
