import fs from "fs";
import path from "path";
import { CosService } from "../cos";
import { downloadTrustedMediaToFile } from "../server/media-response";
import { execMediaCommand, probeMedia } from "./ffmpeg";

// Serialize CPU inference in this server process; concurrent tasks must not each
// allocate a model and starve the web server. The worker streams video frames.
let workerQueue: Promise<unknown> = Promise.resolve();

async function runWorker(operation: string, request: Record<string, unknown>, jobDir: string) {
  const run = async () => {
    const requestPath = path.join(jobDir, `face-${operation}-request.json`);
    fs.writeFileSync(requestPath, JSON.stringify(request));
    try {
      return JSON.parse(await execMediaCommand(
        process.env.LIPSYNC_PYTHON || "/opt/lipsync/bin/python",
        [path.join(process.cwd(), "scripts/face-lipsync/worker.py"), operation, requestPath],
        { timeoutMs: 30 * 60_000 },
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw Object.assign(new Error(message), {
        code: message.match(/LIPSYNC_(FACE_INPUT|INPUT_DURATION|ALIGNMENT|MEDIA)/)?.[0] || "LIPSYNC_RUNTIME",
      });
    } finally {
      fs.rmSync(requestPath, { force: true });
    }
  };
  const pending = workerQueue.then(run, run);
  workerQueue = pending.catch(() => {});
  return pending;
}

const RECOVERY_FILES = ["face-manifest.json", "source-video.mp4", "voice-track.wav"];

export async function prepareFaceLipsync(params: {
  inputVideoPath: string;
  audioPath: string;
  durationSeconds: number;
  jobDir: string;
  taskId: string;
  onLog?: (message: string) => void;
}) {
  const result = await runWorker("prepare", params, params.jobDir);
  if (result.crop?.attemptCount > 1) {
    params.onLog?.(`已自动调整人脸近景（尝试 ${result.crop.attemptCount} 种方案），继续生成`);
  }
  // Persist the coordinate/time mapping and base picture before a paid job can
  // start. Recovery must never treat the provider's face crop as a final video.
  if (CosService.isConfigured()) {
    const uploads = await Promise.allSettled([...RECOVERY_FILES, "face-input.mp4"].map((name) =>
      CosService.uploadFile(path.join(params.jobDir, name), `jobs/${params.taskId}/${name}`)));
    const failed = uploads.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  return {
    videoPath: path.join(params.jobDir, "face-input.mp4"),
    audioPath: path.join(params.jobDir, "face-audio.wav"),
    durationSeconds: result.durationSeconds as number,
  };
}

export async function restoreFaceLipsync(jobDir: string, taskId: string): Promise<number> {
  for (const name of RECOVERY_FILES) {
    const file = path.join(jobDir, name);
    if (fs.existsSync(file)) continue;
    const key = `jobs/${taskId}/${name}`;
    if (!CosService.isConfigured() || !await CosService.objectExists(key)) {
      throw Object.assign(new Error("缺少人脸合成素材，无法恢复完整画面"), { code: "LIPSYNC_MEDIA" });
    }
    if (name === "face-manifest.json") {
      const manifest = await CosService.getJsonFromCos(key);
      if (!manifest) throw Object.assign(new Error("人脸合成记录读取失败"), {code: "LIPSYNC_MEDIA"});
      fs.writeFileSync(file, JSON.stringify(manifest));
    } else {
      await downloadTrustedMediaToFile({ source: await CosService.getDownloadUrl(key), outputPath: file });
    }
  }
  // Older jobs did not persist this reference. Keep their existing fallback,
  // but restore the exact submitted frames whenever they are available.
  const reference = path.join(jobDir, "face-input.mp4");
  const referenceKey = `jobs/${taskId}/face-input.mp4`;
  if (!fs.existsSync(reference) && CosService.isConfigured() && await CosService.objectExists(referenceKey)) {
    await downloadTrustedMediaToFile({ source: await CosService.getDownloadUrl(referenceKey), outputPath: reference });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(jobDir, "face-manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Number.isFinite(manifest.durationSeconds) || manifest.durationSeconds <= 0) {
    throw Object.assign(new Error("人脸合成记录无效"), { code: "LIPSYNC_MEDIA" });
  }
  return manifest.durationSeconds + manifest.prepadSeconds + manifest.postpadSeconds;
}

export async function finalizeFaceLipsync(params: {
  jobDir: string;
  renderedPath: string;
  audioPath: string;
  outputPath: string;
  onLog?: (message: string, level?: "info" | "warn") => void;
  onQualityWarnings?: (warnings: string[]) => void;
}) {
  // Detection findings are advisory; a successfully encoded video is deliverable.
  const candidate = path.join(params.jobDir, "face-final-candidate.mp4");
  try {
    const composite = await runWorker("composite", params, params.jobDir);
    if (composite.registration?.searchAttempts > 1 || composite.registration?.stationaryBlocks > 0) {
      params.onLog?.("已自动调整画面对齐，继续合成成片");
    }
    params.onLog?.(`嘴部合成完成，用时 ${composite.elapsedSeconds} 秒，正在校准配音时间...`);
    const alignment = await runWorker("align", {
      ...params,
      videoPath: path.join(params.jobDir, "face-composited.mp4"),
      outputPath: candidate,
    }, params.jobDir);
    const warnings: string[] = alignment.warnings || [];
    params.onQualityWarnings?.(warnings);
    warnings.forEach(message => params.onLog?.(`检测提示：${message}`, "warn"));
    params.onLog?.(`口型检测${warnings.length ? "完成，已记录检测提示" : "通过"}：初次测量 ${alignment.timingsSeconds.measureBefore} 秒、成片编码 ${alignment.timingsSeconds.encode} 秒、成片复核 ${alignment.timingsSeconds.measureAfter} 秒`);
    fs.renameSync(candidate, params.outputPath);
    return await probeMedia(params.outputPath);
  } finally {
    fs.rmSync(candidate, { force: true });
  }
}
