import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execMediaCommand, prepareSourceVideo, finalizeVideo, probeMedia } from "../src/lib/engine/ffmpeg.ts";

const cases = [
  { name: "portrait", size: "180x320", expected: [180, 320] },
  { name: "landscape", size: "320x180", expected: [320, 180] },
  { name: "square", size: "240x240", expected: [240, 240] },
  { name: "phone portrait rotated 90 degrees", size: "320x180", rotation: 90, expected: [180, 320] },
  { name: "phone portrait rotated -90 degrees", size: "320x180", rotation: -90, expected: [180, 320] },
  { name: "portrait with non-square pixels", size: "240x320", sar: "3/4", expected: [180, 320] },
];

for (const fixture of cases) {
  test(`preparation and final MP4 preserve ${fixture.name} aspect ratio`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-aspect-test-"));
    try {
      let input = path.join(dir, "input.mp4");
      const prepared = path.join(dir, "prepared.mp4");
      const audio = path.join(dir, "voice.wav");
      const final = path.join(dir, "final.mp4");
      await execMediaCommand("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
        `testsrc2=size=${fixture.size}:rate=30`, "-t", "0.4", "-vf", `setsar=${fixture.sar || "1"}`,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", input]);
      if (fixture.rotation) {
        const rotated = path.join(dir, "phone.mp4");
        await execMediaCommand("ffmpeg", ["-v", "error", "-y", "-display_rotation", `${fixture.rotation}`,
          "-i", input, "-c", "copy", rotated]);
        input = rotated;
        assert.equal(Math.abs((await probeMedia(input)).rotation), 90, "fixture must carry phone rotation metadata");
      }
      await execMediaCommand("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
        "sine=frequency=440:sample_rate=44100", "-t", "0.6", audio]);
      const prep = await prepareSourceVideo(input, 0.6, prepared);
      assert.deepEqual([prep.width, prep.height], fixture.expected, "provider input must use the displayed orientation and square pixels");
      const result = await finalizeVideo(prepared, audio, final);
      assert.deepEqual([result.width, result.height], fixture.expected, "downloaded MP4 must retain the source aspect ratio");
      assert.equal(result.hasAudio, true);
      assert.ok(Math.abs(result.durationSeconds - 0.6) < 0.1);
      const streams = JSON.parse(await execMediaCommand("ffprobe", ["-v", "error", "-select_streams", "v:0",
        "-show_streams", "-of", "json", final])).streams;
      assert.equal(streams[0].sample_aspect_ratio, "1:1", "providers and players must not need pixel-aspect metadata");
      assert.equal(result.rotation || 0, 0, "orientation must be baked into the pixels");
      await execMediaCommand("ffmpeg", ["-v", "error", "-xerror", "-i", final, "-f", "null", "-"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
