import { NextRequest, NextResponse } from "next/server";
import { McpClientManager } from "@/lib/mcp/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json({ error: "toolName is required" }, { status: 400 });
    }

    const manager = McpClientManager.getInstance();
    const result = await manager.callTool(toolName, args || {});

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "MCP Tool Call Failed" },
      { status: 500 }
    );
  }
}
