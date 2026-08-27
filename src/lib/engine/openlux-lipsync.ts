import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getAppConfig } from "../config";

export interface OpenLuxLipsyncOptions {
  videoPath: string;
  audioPath: string;
  videoUrl?: string;
  audioUrl?: string;
  onLog?: (msg: string) => void;
}

export interface OpenLuxLipsyncResult {
  lipsyncId: string;
  status: "completed" | "failed";
  downloadUrl?: string;
  creditsUsed?: number;
}

type OpenLuxEnvelope = {
  ErrCode?: number;
  ErrMsg?: string;
  Resp?: Record<string, any>;
};

function isPublicHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/x-m4a";
  if (ext === ".aac") return "audio/aac";
  return "application/octet-stream";
}

export class OpenLuxLipsyncAdapter {
  private static headers(apiKey: string, extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "API-KEY": apiKey,
      "Ai-Trace-Id": randomUUID(),
      ...extra,
    };
  }

  private static async parseJson(resp: Response): Promise<OpenLuxEnvelope> {
    const text = await resp.text();
    try {
      return JSON.parse(text) as OpenLuxEnvelope;
    } catch {
      throw new Error(`OpenLux 返回了无法解析的响应 (${resp.status}): ${text.slice(0, 240)}`);
    }
  }

  private static assertOk(data: OpenLuxEnvelope, action: string): Record<string, any> {
    if ((data.ErrCode ?? 1) !== 0) {
      throw new Error(`${action}失败: ${data.ErrMsg || `ErrCode ${data.ErrCode}`}`);
    }
    return data.Resp || {};
  }

  private static async uploadMedia(params: {
    baseUrl: string;
    apiKey: string;
    filePath: string;
    fileUrl?: string;
    label: string;
    onLog: (msg: string) => void;
  }): Promise<number> {
    const { baseUrl, apiKey, filePath, fileUrl, label, onLog } = params;
    const form = new FormData();

    if (isPublicHttpUrl(fileUrl)) {
      form.append("file_url", fileUrl as string);
      onLog(`[PixVerse] 正在通过公网直链上传${label}...`);
    } else {
      if (!fs.existsSync(filePath)) {
        throw new Error(`找不到本地${label}文件: ${filePath}`);
      }
      const buf = fs.readFileSync(filePath);
      const blob = new Blob([new Uint8Array(buf)], { type: mimeForFile(filePath) });
      form.append("file", blob, path.basename(filePath));
      onLog(`[PixVerse] 正在上传本地${label} (${(buf.length / 1024 / 1024).toFixed(2)} MB)...`);
    }

    const resp = await fetch(`${baseUrl}/openapi/v2/media/upload`, {
      method: "POST",
      headers: this.headers(apiKey),
      body: form,
    });
    const payload = this.assertOk(await this.parseJson(resp), `上传${label}`);
    const mediaId = Number(payload.media_id);
    if (!mediaId) {
      throw new Error(`上传${label}成功但未返回 media_id`);
    }
    onLog(`[PixVerse] ${label}已就绪 (media_id: ${mediaId})`);
    return mediaId;
  }

  public static async execute(
    options: OpenLuxLipsyncOptions,
    outDir: string
  ): Promise<OpenLuxLipsyncResult> {
    const config = getAppConfig();
    const { onLog = () => {} } = options;
    const apiKey = config.openluxApiKey?.trim();
    const baseUrl = (config.openluxBaseUrl || "https://api.openlux.ai").replace(/\/$/, "");
    const model = config.openluxLipsyncModel || "pixverse-lipsync";

    if (!apiKey) {
      throw new Error("未配置 OpenLux API Key，请先在系统设置中填写");
    }

    onLog(`[PixVerse] 正在连接 OpenLux 对口型接口 (${model})...`);

    const videoMediaId = await this.uploadMedia({
      baseUrl,
      apiKey,
      filePath: options.videoPath,
      fileUrl: options.videoUrl,
      label: "视频",
      onLog,
    });
    const audioMediaId = await this.uploadMedia({
      baseUrl,
      apiKey,
      filePath: options.audioPath,
      fileUrl: options.audioUrl,
      label: "音频",
      onLog,
    });

    onLog(`[PixVerse] 正在提交 pixverse-lipsync 对口型任务...`);
    const createResp = await fetch(`${baseUrl}/openapi/v2/video/lip_sync/generate`, {
      method: "POST",
      headers: this.headers(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        video_media_id: videoMediaId,
        audio_media_id: audioMediaId,
      }),
    });
    const created = this.assertOk(await this.parseJson(createResp), "创建对口型任务");
    const lipsyncId = String(created.video_id || "");
    if (!lipsyncId) {
      throw new Error("OpenLux 未返回 video_id");
    }
    const creditsUsed = Number(created.credits || 0) || undefined;
    onLog(
      `[PixVerse] 任务已建立 (ID: ${lipsyncId})${creditsUsed ? `，预计扣除 ${creditsUsed} credits` : ""}，开始轮询进度...`
    );

    const pollDeadline = Date.now() + 3600 * 1000;
    let completedUrl: string | null = null;
    let pollCount = 0;

    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 6000));
      pollCount++;

      const pollResp = await fetch(`${baseUrl}/openapi/v2/video/result/${lipsyncId}`, {
        headers: this.headers(apiKey),
      });
      const polled = this.assertOk(await this.parseJson(pollResp), "查询对口型进度");
      const status = Number(polled.status);

      if (status === 1) {
        completedUrl = polled.url || null;
        onLog("[PixVerse] 对口型渲染完成，正在下载成片...");
        break;
      }
      if (status === 7) {
        throw new Error("[PixVerse] 内容审核未通过");
      }
      if (status === 8) {
        throw new Error(`[PixVerse] 对口型生成失败${polled.ErrMsg ? `: ${polled.ErrMsg}` : ""}`);
      }
      if (pollCount % 3 === 0) {
        onLog(`[PixVerse] 正在渲染中 (轮询第 ${pollCount} 次)...`);
      }
    }

    if (!completedUrl) {
      throw new Error("[PixVerse] 对口型任务超时");
    }

    const rawVideoPath = path.join(outDir, "heygen-result-raw.mp4");
    const videoResp = await fetch(completedUrl);
    if (!videoResp.ok) {
      throw new Error(`下载 PixVerse 结果视频失败: ${videoResp.status} ${videoResp.statusText}`);
    }
    const buf = Buffer.from(await videoResp.arrayBuffer());
    fs.writeFileSync(rawVideoPath, buf);
    onLog(`[PixVerse] 成片已下载 (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

    return {
      lipsyncId,
      status: "completed",
      downloadUrl: completedUrl,
      creditsUsed,
    };
  }
}
