import { McpClientManager, McpToolInfo } from "./client";
import { getAppConfig } from "../config";
import fs from "fs";
import path from "path";

export interface HeyGenSubmissionOptions {
  videoUrl: string;
  audioUrl: string;
  submissionTitle: string;
  onLog?: (msg: string) => void;
}

export interface HeyGenLipsyncResult {
  lipsyncId: string;
  status: "completed" | "failed";
  downloadUrl?: string;
  errorDetail?: string;
  creditsUsed?: number;
}

function findMatchingTool(tools: McpToolInfo[], patterns: string[]): string | null {
  for (const pattern of patterns) {
    const found = tools.find(
      (t) =>
        t.name.toLowerCase() === pattern.toLowerCase() ||
        t.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (found) return found.name;
  }
  return null;
}

function parseMcpToolResponse(toolResult: any): any {
  if (!toolResult) return null;
  if (typeof toolResult === "string") {
    try {
      return JSON.parse(toolResult);
    } catch {
      return toolResult;
    }
  }
  if (toolResult.content && Array.isArray(toolResult.content)) {
    const textItem = toolResult.content.find((c: any) => c.type === "text" || c.text);
    if (textItem && textItem.text) {
      try {
        return JSON.parse(textItem.text);
      } catch {
        return textItem.text;
      }
    }
  }
  if (toolResult.data) return toolResult.data;
  return toolResult;
}

export class HeyGenMcpAdapter {
  public static async executeLipsync(
    options: HeyGenSubmissionOptions,
    outDir: string
  ): Promise<HeyGenLipsyncResult> {
    const config = getAppConfig();
    const { videoUrl, audioUrl, submissionTitle, onLog = () => {} } = options;
    const mcpManager = McpClientManager.getInstance();

    onLog(`[MCP Client] 正在连接高精度口型驱动 MCP 服务端 (${config.heygenMcpTransport.toUpperCase()})...`);

    // Ensure connection to MCP Server
    if (!mcpManager.getStatus().connected) {
      await mcpManager.connect({
        transport: config.heygenMcpTransport,
        serverUrl: config.heygenMcpServerUrl,
        command: config.heygenMcpServerCommand,
        args: config.heygenMcpServerArgs,
      });
    }

    const mcpStatus = mcpManager.getStatus();
    if (!mcpStatus.connected) {
      throw new Error(`MCP 服务端连接失败: ${mcpStatus.error || "请检查 MCP Server 配置"}`);
    }

    const tools = mcpStatus.tools || [];
    onLog(`[MCP Client] MCP 连接成功，已就绪工具列表: [${tools.map((t) => t.name).join(", ")}]`);

    // Resolve MCP tool names
    const createToolName =
      findMatchingTool(tools, ["create_lipsync", "heygen_create_lipsync", "lipsync_create"]) ||
      "create_lipsync";
    const getToolName =
      findMatchingTool(tools, ["get_lipsync", "heygen_get_lipsync", "lipsync_get"]) ||
      "get_lipsync";
    const listToolName =
      findMatchingTool(tools, ["list_lipsyncs", "heygen_list_lipsyncs", "lipsync_list"]) ||
      "list_lipsyncs";

    let lipsyncId: string | null = null;

    // 1. Idempotency check via MCP Tool: list_lipsyncs
    try {
      onLog(`[MCP Client] 正在通过 MCP 工具 (${listToolName}) 检查任务查重...`);
      const listResp = await mcpManager.callTool(listToolName, { limit: 20 });
      const parsedList = parseMcpToolResponse(listResp);
      const items = Array.isArray(parsedList)
        ? parsedList
        : parsedList?.list || parsedList?.data?.list || [];

      const found = items.find(
        (i: any) =>
          i.title === submissionTitle &&
          i.status?.toLowerCase() !== "failed"
      );
      if (found) {
        lipsyncId = found.lipsync_id || found.id;
        onLog(`[MCP Client] 查重命中已存在任务 (${lipsyncId})，状态: ${found.status}，直接恢复任务！`);
      }
    } catch (e: any) {
      onLog(`[MCP Client] 查重提示 (跳过): ${e.message}`);
    }

    // 2. Submit lipsync task via MCP Tool: create_lipsync
    if (!lipsyncId) {
      onLog(`[MCP Client] 正在调用 MCP 工具 (${createToolName}) 创建高精度对口型任务...`);
      const createPayload = {
        video_url: videoUrl,
        audio_url: audioUrl,
        title: submissionTitle,
        mode: "precision",
        disableMusicTrack: true,
        enableCaption: false,
        enableDynamicDuration: false,
        enableSpeechEnhancement: false,
        enableWatermark: false,
        fpsMode: "cfr",
        keepTheSameFormat: true,
      };

      const createRaw = await mcpManager.callTool(createToolName, createPayload);
      const parsed = parseMcpToolResponse(createRaw);

      lipsyncId =
        parsed?.lipsync_id ||
        parsed?.id ||
        parsed?.data?.lipsync_id ||
        parsed?.data?.id ||
        (typeof parsed === "string" ? parsed : null);
    }

    if (!lipsyncId) {
      throw new Error(`无法从 MCP ${createToolName} 返回中解析出有效的 lipsync_id`);
    }

    onLog(`[MCP Client] 高精度唇形驱动任务已建立 (ID: ${lipsyncId})，开始轮询进度...`);

    // 3. Poll for completion via MCP Tool: get_lipsync
    const pollDeadline = Date.now() + 3600 * 1000;
    let completedUrl: string | null = null;
    let pollCount = 0;

    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 6000));
      pollCount++;

      const getRaw = await mcpManager.callTool(getToolName, { lipsync_id: lipsyncId });
      const parsed = parseMcpToolResponse(getRaw);

      const status = (
        parsed?.status ||
        parsed?.data?.status ||
        parsed?.state ||
        "processing"
      ).toLowerCase();

      const url =
        parsed?.video_url ||
        parsed?.download_url ||
        parsed?.url ||
        parsed?.data?.video_url ||
        parsed?.data?.url;

      if (status === "completed" || status === "success") {
        completedUrl = url;
        onLog(`[MCP Client] MCP 对口型渲染完成！正在下载视频...`);
        break;
      } else if (status === "failed" || status === "error") {
        const errorMsg =
          parsed?.error?.message ||
          parsed?.error ||
          parsed?.data?.error ||
          "高精度对口型处理失败";
        throw new Error(`[MCP Client] ${errorMsg}`);
      } else {
        if (pollCount % 3 === 0) {
          onLog(`[MCP Client] MCP 正在对口型渲染中 (轮询第 ${pollCount} 次)...`);
        }
      }
    }

    if (!completedUrl) {
      throw new Error(`[MCP Client] HeyGen 对口型任务超时`);
    }

    // 4. Download result video to outDir
    const rawHeyGenVideoPath = path.join(outDir, "heygen-result-raw.mp4");
    const videoResp = await fetch(completedUrl);
    if (!videoResp.ok) {
      throw new Error(`下载 HeyGen 结果视频失败: ${videoResp.statusText}`);
    }
    const buf = Buffer.from(await videoResp.arrayBuffer());
    fs.writeFileSync(rawHeyGenVideoPath, buf);

    onLog(`[MCP Client] HeyGen 视频下载完成 (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

    return {
      lipsyncId,
      status: "completed",
      downloadUrl: completedUrl,
    };
  }
}
