import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HeyGenDirectMcpProvider } from "./heygen-provider";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface McpConnectionStatus {
  connected: boolean;
  transportType: "sse" | "stdio" | "direct";
  serverName?: string;
  serverVersion?: string;
  tools: McpToolInfo[];
  error?: string;
}

export class McpClientManager {
  private static instance: McpClientManager;
  private client: Client | null = null;
  private transport: SSEClientTransport | StdioClientTransport | null = null;
  private status: McpConnectionStatus = {
    connected: false,
    transportType: "direct",
    tools: [],
  };

  private constructor() {}

  public static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager();
    }
    return McpClientManager.instance;
  }

  public getStatus(): McpConnectionStatus {
    return { ...this.status };
  }

  public async connect(
    config: {
      transport: "sse" | "stdio" | "direct";
      serverUrl?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }
  ): Promise<McpConnectionStatus> {
    await this.disconnect();

    if (config.transport === "direct") {
      this.status = {
        connected: true,
        transportType: "direct",
        serverName: "HeyGen Native MCP Engine",
        serverVersion: "2.0.0",
        tools: [
          {
            name: "create_lipsync",
            description: "Create precision lip-sync job calling HeyGen Cloud Engine directly using Subscription Credits",
            inputSchema: {
              type: "object",
              properties: {
                video_url: { type: "string", description: "Source talking head video URL" },
                audio_url: { type: "string", description: "IndexTTS WAV audio URL" },
                title: { type: "string", description: "Submission title for idempotency" },
                mode: { type: "string", enum: ["precision"], default: "precision" },
              },
              required: ["video_url", "audio_url"],
            },
          },
          {
            name: "get_lipsync",
            description: "Get status and output video URL of a HeyGen lip-sync job",
            inputSchema: {
              type: "object",
              properties: {
                lipsync_id: { type: "string", description: "HeyGen Lip-sync Task ID" },
              },
              required: ["lipsync_id"],
            },
          },
          {
            name: "list_lipsyncs",
            description: "List recent HeyGen lip-sync jobs to prevent duplicate billing",
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number", default: 20 },
              },
            },
          },
          {
            name: "get_remaining_quota",
            description: "Query HeyGen subscription plan details and remaining Premium Credits",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      };
      return this.status;
    }

    try {
      this.client = new Client(
        {
          name: "digital-human-lipsync-web-client",
          version: "2.0.0",
        },
        {
          capabilities: {},
        }
      );

      if (config.transport === "sse") {
        if (!config.serverUrl) throw new Error("SSE Server URL is required");
        this.transport = new SSEClientTransport(new URL(config.serverUrl));
      } else if (config.transport === "stdio") {
        if (!config.command) throw new Error("Stdio command is required");
        this.transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env || (process.env as Record<string, string>),
        });
      } else {
        throw new Error(`Unsupported transport: ${config.transport}`);
      }

      await this.client.connect(this.transport);

      // List tools
      const toolsResult = await this.client.listTools();
      const tools: McpToolInfo[] = (toolsResult.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

      this.status = {
        connected: true,
        transportType: config.transport,
        serverName: "Remote MCP Server",
        serverVersion: "1.0.0",
        tools,
      };

      return this.status;
    } catch (err: any) {
      this.status = {
        connected: false,
        transportType: config.transport,
        tools: [],
        error: err.message || "Failed to connect to MCP server",
      };
      return this.status;
    }
  }

  public async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.status.connected) {
      throw new Error("MCP Client is not connected");
    }

    if (this.status.transportType === "direct" || !this.client) {
      if (name === "create_lipsync" || name === "heygen_create_lipsync") {
        const res = await HeyGenDirectMcpProvider.createLipsync({
          videoUrl: args.video_url,
          audioUrl: args.audio_url,
          title: args.title,
          mode: args.mode || "precision",
        });
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      }
      if (name === "get_lipsync" || name === "heygen_get_lipsync") {
        const res = await HeyGenDirectMcpProvider.getLipsyncStatus(args.lipsync_id);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      }
      if (name === "list_lipsyncs" || name === "heygen_list_lipsyncs") {
        return { content: [{ type: "text", text: JSON.stringify({ list: [] }) }] };
      }
      if (name === "get_remaining_quota" || name === "get_quota") {
        const res = await HeyGenDirectMcpProvider.getQuota();
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      }
      throw new Error(`Direct MCP provider unknown tool: ${name}`);
    }

    const response = await this.client.callTool({
      name,
      arguments: args,
    });

    return response;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        // ignore close error
      }
      this.client = null;
    }
    this.transport = null;
    this.status = {
      connected: false,
      transportType: "direct",
      tools: [],
    };
  }
}
