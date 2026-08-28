const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const COS = require("cos-nodejs-sdk-v5");

const PORT = Number(process.env.PORT || 9000);
const ALLOWED_HOST_SUFFIXES = ["pixverseai.cn", "openlux.ai", "myqcloud.com"];

function send(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求体不是 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function assertAllowedUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("只允许 http/https 地址");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!allowed) {
    throw new Error(`不允许中转该域名: ${host}`);
  }
  return parsed.toString();
}

async function downloadToTemp(sourceUrl) {
  const resp = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PixVerseIngest/1.0)",
      Accept: "*/*",
    },
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`下载源文件失败 (${resp.status})`);
  }
  const tmp = path.join(
    os.tmpdir(),
    `pixverse-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  );
  await pipeline(Readable.fromWeb(resp.body), fs.createWriteStream(tmp));
  const bytes = fs.statSync(tmp).size;
  if (bytes <= 0) throw new Error("下载源文件为空");
  return { tmp, bytes };
}

function uploadToCos(localPath, key) {
  const SecretId = process.env.COS_SECRET_ID;
  const SecretKey = process.env.COS_SECRET_KEY;
  const Bucket = process.env.COS_BUCKET;
  const Region = process.env.COS_REGION || "ap-singapore";
  if (!SecretId || !SecretKey || !Bucket) {
    return Promise.reject(new Error("云函数未配置 COS 密钥"));
  }
  const cos = new COS({ SecretId, SecretKey });
  return new Promise((resolve, reject) => {
    cos.sliceUploadFile(
      {
        Bucket,
        Region,
        Key: key.replace(/^\/+/, ""),
        FilePath: localPath,
      },
      (err) => {
        if (err) reject(err);
        else resolve(`https://${Bucket}.cos.${Region}.myqcloud.com/${key.replace(/^\/+/, "")}`);
      }
    );
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      send(res, 200, { ok: true, service: "pixverse-ingest" });
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { ok: false, error: "只接受 POST" });
      return;
    }

    const token = process.env.INGEST_TOKEN || "";
    const provided = String(req.headers["x-ingest-token"] || "");
    if (!token || provided !== token) {
      send(res, 401, { ok: false, error: "中转令牌无效" });
      return;
    }

    const body = await readBody(req);
    const sourceUrl = assertAllowedUrl(String(body.sourceUrl || ""));
    const cosKey = String(body.cosKey || "").replace(/^\/+/, "");
    if (!cosKey || cosKey.includes("..")) {
      send(res, 400, { ok: false, error: "缺少合法 cosKey" });
      return;
    }

    const { tmp, bytes } = await downloadToTemp(sourceUrl);
    try {
      const cosUrl = await uploadToCos(tmp, cosKey);
      send(res, 200, { ok: true, cosUrl, bytes, cosKey });
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    send(res, 500, { ok: false, error: err.message || "中转失败" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`pixverse-ingest listening on 0.0.0.0:${PORT}`);
});
