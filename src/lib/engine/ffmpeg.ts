import { spawn } from "child_process";
import fs from "fs";
import crypto from "crypto";

export interface MediaProbeInfo {
  durationSeconds: number;
  width?: number;
  height?: number;
  displayAspectRatio?: string;
  fps?: number;
  videoCodec?: string;
  hasAudio: boolean;
  audioChannels?: number;
  sampleRate?: number;
  rotation?: number;
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(
            `Command "${command} ${args.join(" ")}" failed with code ${code}: ${stderr || stdout}`
          )
        );
      }
    });
    child.on("error", (err) => reject(err));
  });
}

export async function probeMedia(filePath: string): Promise<MediaProbeInfo> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Media file not found: ${filePath}`);
  }

  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:stream_tags=rotate:stream_side_data=rotation",
    "-of",
    "json",
    filePath,
  ];

  const output = await execCommand("ffprobe", args);
  const data = JSON.parse(output);

  const format = data.format || {};
  const durationSeconds = parseFloat(format.duration || "0");
  if (!durationSeconds || durationSeconds <= 0) {
    throw new Error(`Invalid or zero media duration for: ${filePath}`);
  }

  let width: number | undefined;
  let height: number | undefined;
  let fps: number | undefined;
  let videoCodec: string | undefined;
  let hasAudio = false;
  let audioChannels: number | undefined;
  let sampleRate: number | undefined;
  let rotation: number | undefined;

  for (const stream of data.streams || []) {
    if (stream.codec_type === "video" && width === undefined) {
      width = parseInt(stream.width, 10);
      height = parseInt(stream.height, 10);
      videoCodec = stream.codec_name;
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split("/").map(Number);
        if (num && den) fps = Math.round((num / den) * 100) / 100;
      }
      if (stream.tags?.rotate) {
        rotation = parseInt(stream.tags.rotate, 10);
      } else if (stream.side_data_list) {
        for (const sd of stream.side_data_list) {
          if (sd.rotation !== undefined) {
            rotation = parseInt(sd.rotation, 10);
          }
        }
      }
    } else if (stream.codec_type === "audio") {
      hasAudio = true;
      audioChannels = parseInt(stream.channels, 10);
      sampleRate = parseInt(stream.sample_rate, 10);
    }
  }

  return {
    durationSeconds,
    width,
    height,
    fps,
    videoCodec,
    hasAudio,
    audioChannels,
    sampleRate,
    rotation,
  };
}

export async function applyToneProfile(
  sourceWavPath: string,
  outputWavPath: string,
  rate: number
): Promise<{ rawDuration: number; selectedDuration: number }> {
  const probeBefore = await probeMedia(sourceWavPath);
  const rawDuration = probeBefore.durationSeconds;

  if (Math.abs(rate - 1.0) < 0.001) {
    fs.copyFileSync(sourceWavPath, outputWavPath);
    return { rawDuration, selectedDuration: rawDuration };
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    sourceWavPath,
    "-filter:a",
    `atempo=${rate}`,
    "-codec:a",
    "pcm_s16le",
    outputWavPath,
  ];

  await execCommand("ffmpeg", args);
  const probeAfter = await probeMedia(outputWavPath);
  return { rawDuration, selectedDuration: probeAfter.durationSeconds };
}

export async function prepareSourceVideo(
  inputVideoPath: string,
  targetDurationSeconds: number,
  outputVideoPath: string,
  fitMode: "smart" | "preserve" = "smart"
): Promise<{ duration: number; width: number; height: number; fps: number }> {
  const probe = await probeMedia(inputVideoPath);
  if (!probe.width || !probe.height) {
    throw new Error("Video has no valid dimensions");
  }

  const videoDuration = probe.durationSeconds;
  const maxEdge = 1920;
  let targetWidth = probe.width;
  let targetHeight = probe.height;

  // Scale down if larger than 1920
  if (Math.max(targetWidth, targetHeight) > maxEdge) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxEdge) / targetWidth);
      targetWidth = maxEdge;
    } else {
      targetWidth = Math.round((targetWidth * maxEdge) / targetHeight);
      targetHeight = maxEdge;
    }
  }

  // Ensure even dimensions
  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

  // Video filter: scale and set 30 fps
  const vf = `scale=${targetWidth}:${targetHeight}:flags=lanczos,fps=30,format=yuv420p`;

  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];

  if (videoDuration < targetDurationSeconds) {
    // Video is shorter than audio -> loop video to match audio length
    const loopCount = Math.ceil(targetDurationSeconds / videoDuration) + 1;
    args.push("-stream_loop", `${loopCount}`, "-i", inputVideoPath);
    args.push("-t", `${targetDurationSeconds}`);
  } else if (videoDuration > targetDurationSeconds + 0.5) {
    if (fitMode === "preserve") {
      throw new Error(
        `Video duration (${videoDuration.toFixed(1)}s) is longer than narration (${targetDurationSeconds.toFixed(1)}s), but fitMode is set to preserve.`
      );
    }
    // Smart trim to target duration
    args.push("-i", inputVideoPath);
    args.push("-t", `${targetDurationSeconds}`);
  } else {
    args.push("-i", inputVideoPath);
    args.push("-t", `${targetDurationSeconds}`);
  }

  args.push("-vf", vf);
  args.push("-c:v", "libx264", "-preset", "fast", "-crf", "18");

  // Keep original audio track or synthesize silent track (HeyGen requires audio track)
  if (probe.hasAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  }

  args.push("-movflags", "+faststart");
  args.push(outputVideoPath);

  await execCommand("ffmpeg", args);
  const outProbe = await probeMedia(outputVideoPath);

  return {
    duration: outProbe.durationSeconds,
    width: outProbe.width || targetWidth,
    height: outProbe.height || targetHeight,
    fps: outProbe.fps || 30,
  };
}

export async function finalizeVideo(
  heygenVideoPath: string,
  exactWavPath: string,
  outputFinalPath: string
): Promise<MediaProbeInfo> {
  if (!fs.existsSync(heygenVideoPath)) {
    throw new Error(`HeyGen video not found: ${heygenVideoPath}`);
  }
  if (!fs.existsSync(exactWavPath)) {
    throw new Error(`Exact IndexTTS WAV not found: ${exactWavPath}`);
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    heygenVideoPath,
    "-i",
    exactWavPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-movflags",
    "+faststart",
    outputFinalPath,
  ];

  await execCommand("ffmpeg", args);
  return await probeMedia(outputFinalPath);
}

export async function extractAudioFromMedia(
  inputMediaFilePath: string,
  outputAudioPath: string
): Promise<string> {
  if (!fs.existsSync(inputMediaFilePath)) {
    throw new Error(`Media file not found: ${inputMediaFilePath}`);
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputMediaFilePath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-q:a",
    "2",
    outputAudioPath,
  ];

  await execCommand("ffmpeg", args);
  return outputAudioPath;
}

export async function extractVideoThumbnail(
  videoPath: string,
  outputImagePath: string
): Promise<string> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "00:00:00.3",
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    outputImagePath,
  ];

  await execCommand("ffmpeg", args);
  return outputImagePath;
}

