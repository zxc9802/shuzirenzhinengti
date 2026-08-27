import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getAppConfig } from "../config";
import { concatVideos, probeMedia, sliceMedia } from "./ffmpeg";
import { downloadFileToDisk } from "./download-file";
import { LIPSYNC_CHUNK_SECONDS, planLipsyncChunks, pollTimeoutMs } from "./lipsync-chunks";

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
  chunkCount?: number;
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

    const resp = await this.fetchWithRetry(`${baseUrl}/openapi/v2/media/upload`, {
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

  private static async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempts = 4
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await fetch(url, init);
        if (resp.status >= 500 || resp.status === 429) {
          lastError = new Error(`HTTP ${resp.status}`);
          await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
          continue;
        }
        return resp;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
      }
    }
    throw lastError || new Error("OpenLux 请求失败");
  }

  private static async executeOnce(
    options: OpenLuxLipsyncOptions & { outputPath: string; durationSeconds?: number },
    ctx: { apiKey: string; baseUrl: string; model: string }
  ): Promise<OpenLuxLipsyncResult> {
    const { onLog = () => {}, outputPath } = options;
    const { apiKey, baseUrl, model } = ctx;

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
    const createResp = await this.fetchWithRetry(`${baseUrl}/openapi/v2/video/lip_sync/generate`, {
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

    const timeoutMs = pollTimeoutMs(options.durationSeconds || 90);
    const pollDeadline = Date.now() + timeoutMs;
    let completedUrl: string | null = null;
    let pollCount = 0;

    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 6000));
      pollCount++;

      try {
        const pollResp = await this.fetchWithRetry(
          `${baseUrl}/openapi/v2/video/result/${lipsyncId}`,
          { headers: this.headers(apiKey) }
        );
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
          const remainMin = Math.max(1, Math.round((pollDeadline - Date.now()) / 60000));
          onLog(`[PixVerse] 正在渲染中 (轮询第 ${pollCount} 次，最长还等 ${remainMin} 分钟)...`);
        }
      } catch (err: any) {
        if (String(err.message || "").includes("内容审核") || String(err.message || "").includes("生成失败")) {
          throw err;
        }
        onLog(`[PixVerse] 轮询暂时失败，将重试: ${err.message}`);
      }
    }

    if (!completedUrl) {
      throw new Error("[PixVerse] 对口型任务超时");
    }

    const downloaded = await downloadFileToDisk({
      url: completedUrl,
      outputPath,
      onProgress: (msg) => onLog(`[PixVerse] 正在拉取成片 ${msg}`),
    });
    onLog(`[PixVerse] 成片已下载 (${(downloaded.bytes / 1024 / 1024).toFixed(2)} MB)`);

    return {
      lipsyncId,
      status: "completed",
      downloadUrl: completedUrl,
      creditsUsed,
      chunkCount: 1,
    };
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

    const audioProbe = await probeMedia(options.audioPath);
    const chunks = planLipsyncChunks(audioProbe.durationSeconds);
    const rawVideoPath = path.join(outDir, "heygen-result-raw.mp4");
    const ctx = { apiKey, baseUrl, model };

    onLog(
      `[PixVerse] 口播时长 ${audioProbe.durationSeconds.toFixed(1)}s，将按每段不超过 ${LIPSYNC_CHUNK_SECONDS}s 提交 ${chunks.length} 个对口型任务`
    );

    if (chunks.length === 1) {
      return this.executeOnce(
        {
          ...options,
          durationSeconds: audioProbe.durationSeconds,
          outputPath: rawVideoPath,
        },
        ctx
      );
    }

    const chunkDir = path.join(outDir, "lipsync-chunks");
    fs.mkdirSync(chunkDir, { recursive: true });
    const rendered: string[] = [];
    const jobIds: string[] = [];
    let creditsUsed = 0;

    for (const chunk of chunks) {
      const label = `${chunk.index + 1}/${chunks.length}`;
      onLog(
        `[PixVerse] 正在处理第 ${label} 段 (${chunk.startSeconds.toFixed(1)}s–${(
          chunk.startSeconds + chunk.durationSeconds
        ).toFixed(1)}s)...`
      );

      const chunkVideo = path.join(chunkDir, `video-${chunk.index}.mp4`);
      const chunkAudio = path.join(chunkDir, `audio-${chunk.index}.wav`);
      const chunkOut = path.join(chunkDir, `result-${chunk.index}.mp4`);

      await sliceMedia({
        inputPath: options.videoPath,
        outputPath: chunkVideo,
        startSeconds: chunk.startSeconds,
        durationSeconds: chunk.durationSeconds,
        kind: "video",
      });
      await sliceMedia({
        inputPath: options.audioPath,
        outputPath: chunkAudio,
        startSeconds: chunk.startSeconds,
        durationSeconds: chunk.durationSeconds,
        kind: "audio",
      });

      const result = await this.executeOnce(
        {
          videoPath: chunkVideo,
          audioPath: chunkAudio,
          durationSeconds: chunk.durationSeconds,
          outputPath: chunkOut,
          onLog,
        },
        ctx
      );
      rendered.push(chunkOut);
      jobIds.push(result.lipsyncId);
      creditsUsed += result.creditsUsed || 0;
    }

    onLog(`[PixVerse] ${chunks.length} 段已完成，正在拼接成完整画面...`);
    await concatVideos(rendered, rawVideoPath);

    return {
      lipsyncId: jobIds.join(","),
      status: "completed",
      creditsUsed: creditsUsed || undefined,
      chunkCount: chunks.length,
    };
  }
}
