import { NextResponse } from "next/server";
import { getHeyGenOAuthStatus } from "@/lib/mcp/heygen-remote";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getHeyGenOAuthStatus());
}
