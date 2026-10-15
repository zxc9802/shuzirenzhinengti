import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

function loadSpeech(fetchResponse, downloads, requests) {
  const source = fs.readFileSync(new URL("../src/lib/engine/indextts.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const deps = {
    fs, path, crypto,
    "../server/safe-log": { logServerError() {} },
    "../server/outbound-url-policy": {
      providerUrlPolicy: provider => ({ name: provider, allowedHosts: ["fal.media"] }),
      assertSameOrigin: (url, base) => {
        if (new URL(url).origin !== new URL(base).origin) throw new Error("Provider control-plane URL changed origin");
      },
      fetchWithOutboundUrlPolicy: async (url, init, policy) => {
        requests.push({ url, init, policy });
        return fetchResponse(url, init);
      },
    },
    "./download-file": { downloadFileToDisk: async input => {
      downloads.push(input); fs.writeFileSync(input.outputPath, "downloaded audio");
    } },
    "./ffmpeg": { applyToneProfile: async (input, output, rate) => {
      fs.copyFileSync(input, output);
      return { rawDuration: 2, selectedDuration: 2 / rate };
    } },
    "./speech-stitch": { splitSpeechText: text => [text] },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "setTimeout", compiled)(name => {
    assert.ok(name in deps, `Unexpected dependency ${name}`); return deps[name];
  }, module, module.exports, async (url, init) => {
    requests.push({ url, init }); return fetchResponse(url, init);
  }, callback => callback());
  return module.exports.generateIndexTTS;
}

function queueResponse(audio) {
  return (url, init) => {
    const responseUrl = "https://queue.fal.run/fal-ai/index-tts-2/requests/test-job";
    if (init.method === "POST") return Response.json({ request_id: "test-job", response_url: responseUrl, status_url: `${responseUrl}/status` });
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    return Response.json({ audio });
  };
}

test("fal speech maps speaker and independent emotion references and downloads either documented output shape", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fal-speech-"));
  const originalCwd = process.cwd(); process.chdir(dir);
  try {
    for (const [index, audio] of ["https://v3.fal.media/output.mp3", { url: "https://v3.fal.media/output.mp3" }].entries()) {
      const downloads = []; const requests = [];
      const generate = loadSpeech(queueResponse(audio), downloads, requests);
      const options = {
        apiKey: "test-only", speakerAudioUrl: "https://speaker.example.test/speaker.wav",
        emotionAudioUrl: "https://speaker.example.test/emotion.wav", emotionIntensity: 0.6,
        cacheScope: `shape-${index}`, outDir: path.join(dir, String(index)),
      };
      const result = await generate("欢迎使用语音测试。", options);
      assert.equal(requests.length, 3);
      assert.equal(requests[0].url, "https://queue.fal.run/fal-ai/index-tts-2/text-to-speech");
      assert.equal(requests[0].init.headers.Authorization, "Key test-only");
      assert.equal(requests[0].policy.name, "fal");
      assert.equal(requests[0].policy.sensitiveHeaders, true);
      assert.deepEqual(JSON.parse(requests[0].init.body), {
        prompt: "欢迎使用语音测试。", audio_url: options.speakerAudioUrl,
        emotional_audio_url: options.emotionAudioUrl, strength: 0.6,
      });
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].url, "https://v3.fal.media/output.mp3");
      assert.equal(downloads[0].urlPolicy.name, "fal");
      assert.equal(result.audioUrl, downloads[0].url);
      assert.equal(result.fromCache, false);
    }
  } finally { process.chdir(originalCwd); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fal failures and missing output never download or publish a final speech track", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fal-speech-errors-"));
  const originalCwd = process.cwd(); process.chdir(dir);
  try {
    for (const [index, response, expected] of [
      [0, () => Response.json({ detail: "Invalid key" }, { status: 401 }), /401/],
      [1, () => Response.json({ detail: "Balance exhausted" }, { status: 403 }), /403/],
      [2, queueResponse(undefined), /音频/],
      [3, () => Response.json({ request_id: "job", status_url: "https://evil.example/status", response_url: "https://queue.fal.run/result" }), /changed origin/],
    ]) {
      const downloads = []; const requests = [];
      const generate = loadSpeech(response, downloads, requests);
      const outDir = path.join(dir, String(index));
      await assert.rejects(generate("错误情况测试。", {
        apiKey: "test-only", speakerAudioUrl: "https://speaker.example.test/a.wav",
        cacheScope: `failure-${index}`, outDir,
      }), expected);
      assert.equal(requests.filter(request => request.init.method === "POST").length, 1, "a rejected paid request must not be resubmitted");
      if (index === 3) assert.equal(requests.length, 1, "credentials must not be sent to a foreign control-plane URL");
      assert.equal(downloads.length, 0);
      assert.equal(fs.existsSync(path.join(outDir, "voice-track.wav")), false);
    }
  } finally { process.chdir(originalCwd); fs.rmSync(dir, { recursive: true, force: true }); }
});
