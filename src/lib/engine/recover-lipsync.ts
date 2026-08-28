import fs from "fs";
import path from "path";
import { CosService } from "../cos";
import { lipsyncModelName, resolveLipsyncProvider } from "../lipsync-provider";
import { TaskItem, TaskStore } from "../store/task-store";
import { finalizeVideo, probeMedia, sha256File } from "./ffmpeg";
import { downloadFileToDisk } from "./download-file";
import { FalVeedLipsyncAdapter } from "./fal-veed-lipsync";
import { downloadPixverseResult } from "./pixverse-ingest";
import { OpenLuxLipsyncAdapter } from "./openlux-lipsync";
import { calculateRequiredPoints, calculateCostCny } from "../main-app-billing";

const LIPSYNC_JOB_RE = /任务已建立 \(ID:\s*([^，)\s]+)\)/;

function taskLipsyncProvider(task: TaskItem) {
  return resolveLipsyncProvider(
    task.inputs.lipsyncProvider || task.results.lipsyncProvider,
    "pixverse"
  );
}

function savedResultUrl(task: TaskItem): string | undefined {
  return task.results?.veedResultUrl || task.results?.pixverseResultUrl;
}

export function extractPixverseJobId(task: TaskItem): string | null {
  const saved = task.results?.heygenLipsyncId?.trim();
  if (saved && !saved.includes(",")) return saved;

  for (let i = (task.logs || []).length - 1; i >= 0; i--) {
    const match = task.logs[i].message.match(LIPSYNC_JOB_RE);
    if (match?.[1]) return match[1];
  }
  return saved || null;
}

export function isRecoverableLipsyncTask(task: TaskItem): boolean {
  if (task.status === "completed" && task.results?.finalVideoUrl) return false;
  return Boolean(
    extractPixverseJobId(task) ||
      savedResultUrl(task) ||
      (task.logs || []).some((entry) => entry.message.includes("正在下载成片"))
  );
}

async function markCompleted(
  taskId: string,
  results: TaskItem["results"],
  message: string
): Promise<TaskItem> {
  TaskStore.addLog(taskId, message, "success");
  const task = TaskStore.get(taskId);
  const duration = results.videoDuration || 0;
  const chargedPoints =
    results.chargedPoints ??
    (task?.billing?.isExternalUser
      ? calculateRequiredPoints(duration)
      : undefined);
  const costCny =
    results.costCny ??
    (task?.billing?.isExternalUser ? calculateCostCny(duration) : undefined);

  const updated = TaskStore.update(taskId, {
    status: "completed",
    step: "done",
    progress: 100,
    error: undefined,
    billing: task?.billing
      ? {
          ...task.billing,
          actualDuration: duration,
          chargedPoints,
          costCny,
          status: "settled",
        }
      : undefined,
    results: {
      ...results,
      chargedPoints,
      costCny,
      billingDuration: duration,
    },
  });
  if (!updated) {
    throw new Error("任务不存在，无法写入恢复结果");
  }
  return updated;
}

async function completeFromCosFiles(task: TaskItem): Promise<TaskItem | null> {
  if (!CosService.isConfigured()) return null;

  const finalKey = `jobs/${task.id}/final.mp4`;
  const audioKey = `jobs/${task.id}/exact-final-indextts.wav`;
  const evidenceKey = `jobs/${task.id}/evidence.json`;
  const hasFinal = await CosService.objectExists(finalKey);
  if (!hasFinal) return null;

  const finalVideoUrl = CosService.getPublicUrl(finalKey);
  const exactAudioUrl = CosService.getPublicUrl(audioKey);
  const evidenceJsonUrl = CosService.getPublicUrl(evidenceKey);
  const jobId = extractPixverseJobId(task);
  let evidence: any = null;
  try {
    evidence = await CosService.getJsonFromCos<any>(evidenceKey);
  } catch {
    evidence = null;
  }

  return markCompleted(
    task.id,
    {
      originalVideoUrl: task.inputs.videoUrl || task.results.originalVideoUrl,
      finalVideoUrl,
      exactAudioUrl,
      evidenceJsonUrl,
      heygenLipsyncId: jobId || task.results.heygenLipsyncId || evidence?.lipsync?.lipsync_id,
      lipsyncProvider: taskLipsyncProvider(task),
      lipsyncCredits: task.results.lipsyncCredits || evidence?.lipsync?.credits,
      pixverseResultUrl: task.results.pixverseResultUrl,
      veedResultUrl: task.results.veedResultUrl,
      videoDuration:
        task.results.videoDuration || evidence?.media?.video?.final_duration_seconds,
      audioDuration: task.results.audioDuration,
      resolution: task.results.resolution || evidence?.media?.video?.resolution,
      fps: task.results.fps || evidence?.media?.video?.fps,
    },
    "已从云端成片恢复任务，不会再次扣费。"
  );
}

async function ensureLocalFile(params: {
  localPath: string;
  cosKey: string;
  fallbackUrl?: string;
  label: string;
  onLog: (msg: string) => void;
}): Promise<string> {
  const { localPath, cosKey, fallbackUrl, label, onLog } = params;
  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1024) {
    return localPath;
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  if (CosService.isConfigured() && (await CosService.objectExists(cosKey))) {
    onLog(`正在从 COS 取回${label}...`);
    const url = await CosService.getDownloadUrl(cosKey, path.basename(cosKey));
    await downloadFileToDisk({ url, outputPath: localPath });
    return localPath;
  }

  if (fallbackUrl) {
    onLog(`正在下载${label}...`);
    await downloadFileToDisk({ url: fallbackUrl, outputPath: localPath });
    return localPath;
  }

  throw new Error(`找不到${label}，无法恢复混流`);
}

export async function recoverStuckLipsyncTask(taskId: string): Promise<TaskItem> {
  const task = (await TaskStore.getAsync(taskId)) || TaskStore.get(taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  if (task.status === "completed" && task.results?.finalVideoUrl) {
    return task;
  }

  const fromCos = await completeFromCosFiles(task);
  if (fromCos) return fromCos;

  const provider = taskLipsyncProvider(task);
  const jobId = extractPixverseJobId(task);
  const savedUrl = savedResultUrl(task);
  if (!jobId && !savedUrl) {
    throw new Error("没有找到已扣费的对口型任务 ID，无法免费恢复");
  }

  TaskStore.addLog(taskId, "正在免费恢复已扣费的对口型成片...", "info");
  TaskStore.update(taskId, {
    status: "processing",
    step: "finalize",
    progress: 85,
    error: undefined,
  });

  let resultUrl = savedUrl;
  let creditsUsed = task.results?.lipsyncCredits;
  if (jobId) {
    if (provider === "veed") {
      const remote = await FalVeedLipsyncAdapter.fetchResult(jobId);
      if (remote.status !== "COMPLETED" || !remote.url) {
        throw new Error(`对口型结果还不能下载（status=${remote.status}）`);
      }
      resultUrl = remote.url;
      TaskStore.update(taskId, {
        results: {
          heygenLipsyncId: jobId,
          lipsyncProvider: "veed",
          veedResultUrl: resultUrl,
        },
      });
    } else {
      const remote = await OpenLuxLipsyncAdapter.fetchResult(jobId);
      if (remote.status !== 1 || !remote.url) {
        throw new Error(`对口型结果还不能下载（status=${remote.status}）`);
      }
      resultUrl = remote.url;
      creditsUsed = remote.creditsUsed || creditsUsed;
      TaskStore.update(taskId, {
        results: {
          heygenLipsyncId: jobId,
          lipsyncProvider: "pixverse",
          lipsyncCredits: creditsUsed,
          pixverseResultUrl: resultUrl,
        },
      });
    }
  }

  if (!resultUrl) {
    throw new Error("对口型已完成但没有成片地址");
  }

  const jobDir = path.join(process.cwd(), "public", "jobs", taskId);
  fs.mkdirSync(jobDir, { recursive: true });
  const rawPath = path.join(jobDir, "heygen-result-raw.mp4");
  const audioPath = path.join(jobDir, "exact-final-indextts.wav");
  const finalPath = path.join(jobDir, "final.mp4");

  const log = (msg: string) => TaskStore.addLog(taskId, msg, "info");
  const providerLabel = provider === "veed" ? "VEED" : "PixVerse";
  log(`[${providerLabel}] 正在重新下载已渲染成片（不会再扣费）...`);
  const downloaded =
    provider === "veed"
      ? await downloadFileToDisk({
          url: resultUrl,
          outputPath: rawPath,
          onProgress: (msg) => log(`[VEED] ${msg}`),
        })
      : await downloadPixverseResult({
          url: resultUrl,
          outputPath: rawPath,
          onLog: log,
        });
  const viaRelay = "viaRelay" in downloaded ? downloaded.viaRelay : false;
  log(
    `[${providerLabel}] 成片已下载 (${(downloaded.bytes / 1024 / 1024).toFixed(2)} MB${
      viaRelay ? "，经广州中转" : ""
    })`
  );

  await ensureLocalFile({
    localPath: audioPath,
    cosKey: `jobs/${taskId}/exact-final-indextts.wav`,
    fallbackUrl: task.results.exactAudioUrl,
    label: "原声音轨",
    onLog: log,
  });

  log("正在将成片与原声音轨混流封装...");
  const finalProbe = await finalizeVideo(rawPath, audioPath, finalPath);
  const sha256Video = await sha256File(finalPath);
  const sha256Audio = await sha256File(audioPath);

  let finalVideoUrl = `/jobs/${taskId}/final.mp4`;
  let exactAudioUrl = `/jobs/${taskId}/exact-final-indextts.wav`;
  let evidenceJsonUrl = `/jobs/${taskId}/evidence.json`;

  const evidencePayload = {
    task_id: taskId,
    created_at: new Date().toISOString(),
    recovered: true,
    script_text: task.inputs.scriptText,
    lipsync: {
      provider,
      lipsync_id: jobId,
      model: lipsyncModelName(provider),
      credits: creditsUsed,
    },
    media: {
      video: {
        final_duration_seconds: finalProbe.durationSeconds,
        resolution: `${finalProbe.width}x${finalProbe.height}`,
        fps: finalProbe.fps,
        sha256: sha256Video,
      },
      audio: {
        sample_rate: finalProbe.sampleRate,
        sha256: sha256Audio,
      },
    },
  };
  const evidencePath = path.join(jobDir, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidencePayload, null, 2), "utf-8");

  if (CosService.isConfigured()) {
    finalVideoUrl = await CosService.uploadFile(finalPath, `jobs/${taskId}/final.mp4`);
    exactAudioUrl = await CosService.uploadFile(audioPath, `jobs/${taskId}/exact-final-indextts.wav`);
    evidenceJsonUrl = await CosService.uploadFile(evidencePath, `jobs/${taskId}/evidence.json`);
  }

  return markCompleted(
    taskId,
    {
      originalVideoUrl: task.inputs.videoUrl || task.results.originalVideoUrl,
      finalVideoUrl,
      exactAudioUrl,
      evidenceJsonUrl,
      heygenLipsyncId: jobId || task.results.heygenLipsyncId,
      lipsyncProvider: provider,
      lipsyncCredits: creditsUsed,
      pixverseResultUrl: provider === "pixverse" ? resultUrl : task.results.pixverseResultUrl,
      veedResultUrl: provider === "veed" ? resultUrl : task.results.veedResultUrl,
      videoDuration: finalProbe.durationSeconds,
      audioDuration: (await probeMedia(audioPath)).durationSeconds,
      resolution: `${finalProbe.width}x${finalProbe.height}`,
      fps: finalProbe.fps,
      sha256Video,
      sha256Audio,
    },
    "已恢复已扣费成片，任务完成。"
  );
}
