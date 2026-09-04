import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("ownerless cloud avatar metadata is assigned to the authenticated recovery admin", async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "avatar-recovery-test-"));
  process.chdir(tempDir);

  const { CosService } = await import("../src/lib/cos.ts");
  const originals = {
    isConfigured: CosService.isConfigured,
    getJsonFromCos: CosService.getJsonFromCos,
    listFiles: CosService.listFiles,
    saveJsonToCos: CosService.saveJsonToCos,
  };
  let savedCloudRecords = null;
  CosService.isConfigured = () => true;
  CosService.getJsonFromCos = async () => [{
    id: "legacy-avatar",
    name: "Legacy avatar",
    videoUrl: "https://media.example.test/legacy.mp4",
    durationSeconds: 10,
    width: 720,
    height: 1280,
    fileSize: 1024,
    createdAt: 1,
    isCos: true,
  }];
  CosService.listFiles = async () => [];
  CosService.saveJsonToCos = async (_key, records) => {
    savedCloudRecords = records;
  };

  try {
    const { AvatarStore } = await import(
      `../src/lib/store/avatar-store.ts?legacy-recovery=${Date.now()}`
    );
    const avatars = await AvatarStore.getAllAsync("admin-user-id");
    assert.equal(avatars.length, 1);
    assert.equal(avatars[0].userId, "admin-user-id");
    assert.equal(savedCloudRecords[0].userId, "admin-user-id");

    const local = JSON.parse(
      await readFile(path.join(tempDir, ".runtime", "state", "avatars.json"), "utf8"),
    );
    assert.equal(local[0].userId, "admin-user-id");
  } finally {
    CosService.isConfigured = originals.isConfigured;
    CosService.getJsonFromCos = originals.getJsonFromCos;
    CosService.listFiles = originals.listFiles;
    CosService.saveJsonToCos = originals.saveJsonToCos;
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin recovery merges unindexed legacy videos into a non-empty cloud index without duplicates", async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "avatar-reconcile-test-"));
  process.chdir(tempDir);

  const { CosService } = await import("../src/lib/cos.ts");
  const originals = {
    isConfigured: CosService.isConfigured,
    getJsonFromCos: CosService.getJsonFromCos,
    listFiles: CosService.listFiles,
    objectExists: CosService.objectExists,
    getPublicUrl: CosService.getPublicUrl,
    saveJsonToCos: CosService.saveJsonToCos,
  };
  let listCalls = 0;
  let savedCloudRecords = null;
  CosService.isConfigured = () => true;
  CosService.getJsonFromCos = async () => [
    {
      id: "current-avatar",
      userId: "admin-user-id",
      name: "Current avatar",
      videoUrl: "https://media.example.test/uploads/users/admin/videos/current.mp4",
      durationSeconds: 10,
      width: 720,
      height: 1280,
      fileSize: 1024,
      createdAt: 3,
      isCos: true,
    },
    {
      id: "already-indexed-legacy-avatar",
      userId: "admin-user-id",
      name: "Already indexed",
      videoUrl: "https://media.example.test/uploads/videos/1700000000000_legacy-one.mp4",
      durationSeconds: 10,
      width: 720,
      height: 1280,
      fileSize: 1024,
      createdAt: 2,
      isCos: true,
    },
  ];
  CosService.listFiles = async () => {
    listCalls += 1;
    return [
      {
        key: "uploads/videos/1700000000000_legacy-one.mp4",
        size: 1024,
        lastModified: "2026-08-20T00:00:00.000Z",
      },
      {
        key: "uploads/videos/1700000000001_legacy-two.mov",
        size: 2048,
        lastModified: "2026-08-21T00:00:00.000Z",
      },
      {
        key: "uploads/videos/nested/ignored.mp4",
        size: 4096,
        lastModified: "2026-08-22T00:00:00.000Z",
      },
      {
        key: "uploads/videos/readme.txt",
        size: 32,
        lastModified: "2026-08-22T00:00:00.000Z",
      },
    ];
  };
  CosService.objectExists = async (key) => key.endsWith("legacy-two.mov.jpg");
  CosService.getPublicUrl = (key) => `https://media.example.test/${key}`;
  CosService.saveJsonToCos = async (_key, records) => {
    savedCloudRecords = records;
  };

  try {
    const { AvatarStore } = await import(
      `../src/lib/store/avatar-store.ts?legacy-reconcile=${Date.now()}`
    );
    const first = await AvatarStore.getAllAsync("admin-user-id");
    const second = await AvatarStore.getAllAsync("admin-user-id");

    assert.equal(first.length, 3);
    assert.equal(second.length, 3);
    assert.equal(listCalls, 1);
    assert.equal(
      first.filter((avatar) => avatar.videoUrl.endsWith("legacy-one.mp4")).length,
      1,
    );
    const recovered = first.find((avatar) => avatar.videoUrl.endsWith("legacy-two.mov"));
    assert.equal(recovered.userId, "admin-user-id");
    assert.equal(
      recovered.coverUrl,
      "https://media.example.test/uploads/thumbnails/1700000000001_legacy-two.mov.jpg",
    );
    assert.equal(savedCloudRecords.length, 3);
  } finally {
    CosService.isConfigured = originals.isConfigured;
    CosService.getJsonFromCos = originals.getJsonFromCos;
    CosService.listFiles = originals.listFiles;
    CosService.objectExists = originals.objectExists;
    CosService.getPublicUrl = originals.getPublicUrl;
    CosService.saveJsonToCos = originals.saveJsonToCos;
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
