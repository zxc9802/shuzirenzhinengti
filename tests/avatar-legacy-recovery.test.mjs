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
    CosService.saveJsonToCos = originals.saveJsonToCos;
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
