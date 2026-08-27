import fs from "fs";
import path from "path";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_STALL_MS = 45_000;
const DEFAULT_TIMEOUT_MS = 8 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadFileToDisk(params: {
  url: string;
  outputPath: string;
  onProgress?: (message: string) => void;
  attempts?: number;
  stallTimeoutMs?: number;
  timeoutMs?: number;
}): Promise<{ bytes: number }> {
  const {
    url,
    outputPath,
    onProgress,
    attempts = DEFAULT_ATTEMPTS,
    stallTimeoutMs = DEFAULT_STALL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0) {
        onProgress?.(`下载中断，正在重试 (${i + 1}/${attempts})...`);
        await sleep(2000 * i);
      }
      return await downloadOnce({
        url,
        outputPath,
        onProgress,
        stallTimeoutMs,
        timeoutMs,
      });
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
    }
  }

  throw lastError || new Error("下载失败");
}

async function downloadOnce(params: {
  url: string;
  outputPath: string;
  onProgress?: (message: string) => void;
  stallTimeoutMs: number;
  timeoutMs: number;
}): Promise<{ bytes: number }> {
  const { url, outputPath, onProgress, stallTimeoutMs, timeoutMs } = params;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const abortWith = (reason: string) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => abortWith("下载停滞超时"), stallTimeoutMs);
  };

  const overallTimer = setTimeout(() => abortWith("下载总时长超时"), timeoutMs);
  armStall();

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DigitalHumanStudio/1.0)",
        Accept: "*/*",
      },
    });
    if (!resp.ok) {
      throw new Error(`下载失败 (${resp.status} ${resp.statusText})`);
    }
    if (!resp.body) {
      throw new Error("下载失败：响应没有内容");
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const writer = fs.createWriteStream(outputPath);
    const reader = resp.body.getReader();
    const total = Number(resp.headers.get("content-length") || 0);
    let received = 0;
    let lastLogged = 0;

    try {
      while (true) {
        if (Date.now() > deadline) {
          throw new Error("下载总时长超时");
        }
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        armStall();
        await new Promise<void>((resolve, reject) => {
          writer.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
        });
        if (onProgress && received - lastLogged >= 4 * 1024 * 1024) {
          lastLogged = received;
          const got = (received / 1024 / 1024).toFixed(1);
          const all = total ? `${(total / 1024 / 1024).toFixed(1)}` : "?";
          onProgress(`已写入 ${got} / ${all} MB`);
        }
      }
    } catch (err) {
      writer.destroy();
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // ignore
      }
      throw err;
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

    if (received <= 0) {
      throw new Error("下载失败：文件为空");
    }

    return { bytes: received };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    clearTimeout(overallTimer);
  }
}
