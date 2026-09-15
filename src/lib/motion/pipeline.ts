import "server-only";
import fs from "node:fs";
import path from "node:path";
import { probeMedia, execMediaCommand } from "@/lib/engine/ffmpeg";
import { downloadTrustedMediaToFile } from "@/lib/server/media-response";
import { isOwnedUploadSource } from "@/lib/server/upload-policy";
import { logServerError } from "@/lib/server/safe-log";
import { CosService } from "@/lib/cos";
import { MAX_MOTION_SECONDS, MotionInputError, validateMotionEdit } from "./contract";
import { MotionStore, motionDirectory, type StoredMotionProject } from "./store";
import { transcribeMotion, summarizeMotion } from "./analyze";
import { renderMotion } from "./render";

export async function runMotion(id: string, operation: "analyze" | "render") {
  let project = await MotionStore.get(id);
  if (!project) return;
  const update = async (changes: Partial<StoredMotionProject>) => {project = await MotionStore.save({...project!, ...changes});};
  try {
    if (!isOwnedUploadSource({source: project.source, userId: project.userId, folder: "videos"})) throw new Error("Invalid owned source");
    const source = path.join(motionDirectory(id), "source.mp4");
    if (!fs.existsSync(source)) await downloadTrustedMediaToFile({source: project.source, outputPath: source});
    const probe = await probeMedia(source);
    if (!probe.width || !probe.height || !probe.hasAudio) throw new MotionInputError("请上传同时包含画面和口播声音的视频");
    if (probe.durationSeconds > MAX_MOTION_SECONDS) throw new MotionInputError("单条动效视频最长支持 10 分钟");
    const codec = (await execMediaCommand("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", source])).trim();
    if (!["aac", "mp3", "alac"].includes(codec)) throw new MotionInputError("为保留原声，请将剪辑版导出为含 AAC 或 MP3 音轨的 MP4/MOV 后上传");
    await update({duration: probe.durationSeconds, width: probe.width, height: probe.height, progress: 12, message: operation === "analyze" ? "正在识别口播字幕" : "正在准备成片"});
    if (operation === "analyze") {
      if (!project!.captions.length) await update({captions: await transcribeMotion(source, probe.durationSeconds)});
      validateMotionEdit(project, probe.durationSeconds);
      await update({progress: 48, message: "正在按口播整理底部总结"});
      const scenes = await summarizeMotion(project!.captions);
      scenes[scenes.length - 1].end = probe.durationSeconds;
      const edit = validateMotionEdit({...project, scenes}, probe.durationSeconds, true);
      await update({...edit, status: "ready", progress: 100, message: "字幕与总结已整理，可校对后生成成片", error: undefined});
    } else {
      const edit = validateMotionEdit(project, probe.durationSeconds, true);
      let effectTemplate: import("../motion-library/contract").EffectTemplate | undefined;
      if (edit.effect) {
        const {EffectStore} = await import("../motion-library/store");
        const effect = await EffectStore.get(edit.effect.id), version = effect?.versions.find(v => v.revision === edit.effect!.revision);
        if (!effect || effect.userId !== project!.userId || !effect.saved || !version) throw new MotionInputError("所选动效版本不可用，请重新选择");
        const assets = [];
        for (const asset of version.assets) {
          const local = path.join(motionDirectory(id), asset.id + (asset.kind === "image" ? ".jpg" : ".mp4"));
          await downloadTrustedMediaToFile({source: asset.source, outputPath: local});
          const {source: _source, ...publicAsset} = asset;
          assets.push({...publicAsset, url: local});
        }
        effectTemplate = {compiled: version.compiled, assets, backgroundColor: version.backgroundColor};
      }
      let lastProgress = 12;
      const output = await renderMotion(source, edit, probe.durationSeconds, percent => {
        const progress = Math.round(15 + percent * 0.76);
        if (progress < lastProgress + 3) return;
        lastProgress = progress;
        void update({progress, message: `正在渲染动效成片 ${percent}%`}).catch(err => logServerError("motion.progress", err));
      }, effectTemplate);
      await update({progress: 94, message: "正在保存成片"});
      const stored = CosService.isConfigured() ? await CosService.uploadFile(output, `jobs/${id}/final.mp4`) : output;
      if (CosService.isConfigured()) await CosService.uploadFile(path.join(motionDirectory(id), "evidence.json"), `jobs/${id}/evidence.json`);
      await update({status: "completed", progress: 100, message: "动效成片已完成，原声校验通过", output: stored, error: undefined});
    }
  } catch (error) {
    logServerError("motion.pipeline", error);
    const message = error instanceof MotionInputError ? error.message : operation === "analyze"
      ? "自动整理失败，请重试；已识别的字幕会保留，也可手动补充字幕和总结"
      : "成片生成失败，请重试；如持续失败请联系管理员检查渲染服务";
    await update({status: "failed", message, error: message}).catch(err => logServerError("motion.failure_save", err));
  }
}
