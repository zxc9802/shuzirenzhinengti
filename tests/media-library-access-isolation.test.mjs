import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("media library global viewers use stable account identifiers", async () => {
  const {
    canManageMediaItem,
    canViewAllMedia,
  } = await import("../src/lib/media-access-policy.ts");

  const context = (account, overrides = {}) => ({
    isolated: true,
    userId: `user-${account}`,
    isAdmin: false,
    session: { user: { account } },
    ...overrides,
  });

  assert.equal(canViewAllMedia(context("11111111")), true);
  assert.equal(canViewAllMedia(context("13919840885")), true);
  assert.equal(canViewAllMedia(context("ordinary-user")), false);
  assert.equal(canViewAllMedia(context("ordinary-user", { isAdmin: true })), true);

  const wangXing = context("11111111");
  assert.equal(canManageMediaItem(wangXing, { userId: "someone-else" }), false);
  assert.equal(canManageMediaItem(wangXing, { userId: wangXing.userId }), true);
  assert.equal(
    canManageMediaItem(context("admin", { isAdmin: true }), { userId: "someone-else" }),
    true
  );
});

test("avatar and voice records persist their owner", async () => {
  const avatarStore = await read("src/lib/store/avatar-store.ts");
  const voiceStore = await read("src/lib/store/voice-store.ts");

  assert.match(avatarStore, /userId\?: string/);
  assert.match(voiceStore, /userId\?: string/);
});

test("avatar APIs enforce visibility and ownership", async () => {
  const routes = [
    "src/app/api/avatars/route.ts",
    "src/app/api/avatars/extract-cover/route.ts",
    "src/app/api/upload/route.ts",
  ];

  for (const route of routes) {
    const source = await read(route);
    assert.match(source, /resolveAccessContext\(req\)/, `${route} 必须解析账号上下文`);
    assert.match(source, /unauthorizedResponse\(\)/, `${route} 必须拒绝未登录请求`);
  }

  const libraryRoute = await read("src/app/api/avatars/route.ts");
  assert.match(libraryRoute, /canViewAllMedia/);
  assert.match(libraryRoute, /canManageMediaItem/);
  assert.match(libraryRoute, /userId: access\.userId/);

  const uploadRoute = await read("src/app/api/upload/route.ts");
  assert.match(uploadRoute, /userId: access\.userId/);

  const coverRoute = await read("src/app/api/avatars/extract-cover/route.ts");
  assert.match(coverRoute, /canManageMediaItem\(access, avatar\)/);
});

test("voice APIs keep the system default visible and enforce ownership", async () => {
  const source = await read("src/app/api/voices/route.ts");

  assert.match(source, /resolveAccessContext\(req\)/);
  assert.match(source, /unauthorizedResponse\(\)/);
  assert.match(source, /voice\.isDefault/);
  assert.match(source, /canViewAllMedia/);
  assert.match(source, /canManageMediaItem/);
  assert.match(source, /userId: access\.userId/g);
});

test("new object-storage keys are namespaced by user", async () => {
  const presignRoute = await read("src/app/api/cos/presign/route.ts");
  const uploadRoute = await read("src/app/api/upload/route.ts");
  const voiceRoute = await read("src/app/api/voices/route.ts");

  assert.match(presignRoute, /uploads\/users\/\$\{ownerKey\}/);
  assert.match(presignRoute, /ALLOWED_UPLOAD_FOLDERS/);
  assert.match(uploadRoute, /uploads["\),]+\s*"users"/);
  assert.match(voiceRoute, /uploads["\),]+\s*"users"/);
});
