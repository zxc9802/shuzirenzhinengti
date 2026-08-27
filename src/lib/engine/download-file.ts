import fs from "fs";
import path from "path";

export async function downloadFileToDisk(params: {
  url: string;
  outputPath: string;
  onProgress?: (message: string) => void;
}): Promise<{ bytes: number }> {
  const { url, outputPath, onProgress } = params;
  const resp = await fetch(url);
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
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
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

  return { bytes: received };
}
