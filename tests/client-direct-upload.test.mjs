import assert from "node:assert/strict";
import test from "node:test";
import { uploadMediaFile } from "../src/lib/client-media-upload.ts";

test("browser sends file slices to storage, retries a failed slice and confirms before reporting success", async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  const requests = [];
  const controls = [];
  const progress = [];
  const size = 2.5 * 1024 * 1024;
  const parts = [1024 * 1024, 1024 * 1024, 512 * 1024].map((size, i) => ({ size, url: `https://storage.example.test/part-${i}` }));
  let failedPart = false;
  let confirms = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    controls.push({ url, body });
    if (String(url).endsWith("/direct")) return Response.json({ direct: true, uploadKey: "owned-key", parts });
    if (++confirms === 1) return Response.json({ error: "暂时无法确认" }, { status: 503 });
    return Response.json({ success: true, uploadKey: "owned-key", storedRemotely: true });
  };
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(blob) {
      requests.push({ method: this.method, url: this.url, size: blob.size, headers: this.headers });
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: blob.size, total: blob.size });
        if (this.url === parts[1].url && !failedPart) { failedPart = true; this.onerror(); return; }
        this.status = this.url.startsWith("https://storage.") ? 200 : 413;
        this.responseText = "";
        this.onload();
      });
    }
  };
  try {
    const result = await uploadMediaFile(new Blob([Buffer.alloc(size)], { type: "video/mp4" }), "黄总.mp4", "videos", p => progress.push(p));
    assert.deepEqual(result, { uploadKey: "owned-key", storedRemotely: true });
    assert.deepEqual(requests.map(r => r.url), [parts[0].url, parts[1].url, parts[1].url, parts[2].url]);
    assert.ok(requests.every(r => r.method === "PUT" && !Object.hasOwn(r.headers, "Content-Length")));
    assert.deepEqual(requests.map(r => r.size), [1048576, 1048576, 1048576, 524288]);
    assert.equal(controls[0].body.fileSize, size);
    assert.ok(controls.every(r => JSON.stringify(r.body).length < 512));
    assert.equal(confirms, 2);
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.slice(0, -1).every(p => p < 100), "100% requires final confirmation");
  } finally { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXhr; }
});


test("denied direct parts stop without falling back to a whole-file server upload", async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  const calls = [];
  globalThis.fetch = async () => Response.json({ direct: true, uploadKey: "owned", parts: [{ url: "https://storage.example.test/part", size: 4 }] });
  globalThis.XMLHttpRequest = class {
    upload = {};
    open(method, url) { calls.push({ method, url }); }
    setRequestHeader() {}
    send() { this.status = 403; queueMicrotask(() => this.onload()); }
  };
  try {
    await assert.rejects(uploadMediaFile(new Blob(["data"], {type:"video/mp4"}), "video.mp4"), /403/);
    assert.deepEqual(calls, [{method:"PUT", url:"https://storage.example.test/part"}]);
  } finally { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXhr; }
});

test("installations without COS keep their existing local upload behavior", async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  const file = new Blob(["video"], {type:"video/mp4"});
  let sent;
  globalThis.fetch = async () => Response.json({direct:false});
  globalThis.XMLHttpRequest = class {
    upload = {};
    open(method, url) { assert.equal(method, "POST"); assert.match(url, /^\/api\/upload\?/); }
    setRequestHeader() {}
    send(body) {
      sent = body; this.status = 200;
      this.responseText = JSON.stringify({success:true, uploadKey:"local-key", storedRemotely:false});
      queueMicrotask(() => this.onload());
    }
  };
  try {
    assert.deepEqual(await uploadMediaFile(file, "video.mp4"), {uploadKey:"local-key", storedRemotely:false});
    assert.equal(sent, file);
  } finally { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXhr; }
});
