import { NextRequest, NextResponse } from "next/server";
import { McpClientManager } from "@/lib/mcp/client";
import { getAppConfig } from "@/lib/config";

export async function GET() {
  const config = getAppConfig();
  const manager = McpClientManager.getInstance();

  if (!manager.getStatus().connected) {
    await manager.connect({
      transport: config.heygenMcpTransport,
      serverUrl: config.heygenMcpServerUrl,
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
