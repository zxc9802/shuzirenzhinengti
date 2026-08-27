import { NextRequest, NextResponse } from "next/server";
import { McpClientManager } from "@/lib/mcp/client";
import { getAppConfig } from "@/lib/config";
import { HEYGEN_REMOTE_MCP_URL, hasHeyGenOAuthTokens } from "@/lib/mcp/heygen-oauth-store";

export async function GET() {
  const config = getAppConfig();
  const manager = McpClientManager.getInstance();
  const transport = hasHeyGenOAuthTokens() ? "remote" : config.heygenMcpTransport;

  if (!manager.getStatus().connected || manager.getStatus().transportType !== transport) {
    await manager.connect({
      transport,
      serverUrl: transport === "remote" ? HEYGEN_REMOTE_MCP_URL : config.heygenMcpServerUrl,
      command: config.heygenMcpServerCommand,
      args: config.heygenMcpServerArgs,
    });
  }

  return NextResponse.json({
    status: manager.getStatus(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const manager = McpClientManager.getInstance();

  const status = await manager.connect({
    transport: body.transport || "direct",
    serverUrl: body.serverUrl,
    command: body.command,
    args: body.args,
  });

  return NextResponse.json({ status });
}
