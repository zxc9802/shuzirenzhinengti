import fs from "fs";
import path from "path";
import { execMediaCommand, probeMedia } from "./ffmpeg";

// Keep individual requests short enough that the provider rarely needs another internal split.
const MAX_SEGMENT_CHARACTERS = 50;

export function splitSpeechText(text: string): string[] {
  const result: string[] = [];
  const sentences = new Intl.Segmenter("zh", { granularity: "sentence" });
  const words = new Intl.Segmenter("zh", { granularity: "word" });
  const length = (value: string) => Array.from(value).length;
  for (const { segment } of sentences.segment(text.trim())) {
    const sentence = segment.trim();
    if (!sentence) continue;
    if (length(sentence) <= MAX_SEGMENT_CHARACTERS) {
      result.push(sentence);
      continue;
    }
    let current = "";
    for (const clause of sentence.split(/(?<=[，,、：:])/u)) {
      const units = length(clause) <= MAX_SEGMENT_CHARACTERS
        ? [clause] : Array.from(words.segment(clause), item => item.segment);
      for (const unit of units) {
        if (current && length(current + unit) > MAX_SEGMENT_CHARACTERS) {
          if (current.trim()) result.push(current.trim());
          current = "";
        }
        current += unit;
      }
    }
    if (current.trim()) result.push(current.trim());
  }
  return result;
}

export async function stitchSpeechSegments(
  segments: { text: string; audioPath: string }[],
  outputPath: string,
): Promise<void> {
  const joinDir = fs.mkdtempSync(path.join(path.dirname(outputPath), ".tts-join-"));
  // Trim only the beginning, then reverse to trim only the end. Never remove pauses inside speech.
  const trimEdge = "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-55dB:start_silence=0.035:window=0.01";
  try {
    const entries: string[] = [];
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const name = `${index}.wav`;
      const pause = /[。！？!?；;.][”’"')）]*$/u.test(segment.text.trim()) ? 0.18 : 0.06;
      const filters = ["aresample=22050", "aformat=channel_layouts=mono", trimEdge,
        "areverse", trimEdge, "areverse"];
      const padding = index < segments.length - 1 ? pause : 0;
      if (padding) filters.push(`apad=pad_dur=${padding}`);
      await execMediaCommand("ffmpeg", ["-v", "error", "-y", "-i", segment.audioPath,
        "-af", filters.join(","), "-c:a", "pcm_s16le", path.join(joinDir, name)]);
      const audio = await probeMedia(path.join(joinDir, name));
      if (audio.durationSeconds <= padding + 0.02) throw new Error(`第 ${index + 1} 段没有可用声音，请重新合成`);
      entries.push(`file '${name}'`);
    }
    const listPath = path.join(joinDir, "parts.txt");
    fs.writeFileSync(listPath, entries.join("\n"));
    await execMediaCommand("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "1",
      "-i", listPath, "-c:a", "pcm_s16le", outputPath]);
  } finally {
    fs.rmSync(joinDir, { recursive: true, force: true });
  }
}
