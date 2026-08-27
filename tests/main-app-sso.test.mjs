import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("shuziren site keeps the main-site SSO callback and encrypted session contract", async () => {
  const [sso, callback, session, middleware, env] = await Promise.all([
    read("src/lib/main-app-sso.ts"),
    read("src/app/api/sso/callback/route.ts"),
    read("src/app/api/sso/session/route.ts"),
    read("src/middleware.ts"),
    read(".env.example"),
  ]);

  assert.match(sso, /const PRODUCT = ["']shuziren["']/);
  assert.match(sso, /const COOKIE_NAME = ["']qycm_shuziren_sso["']/);
  assert.match(sso, /https:\/\/shuziren\.qycm\.top/);
  assert.match(sso, /externalSso/);
  assert.match(sso, /AES-GCM/);
  assert.match(sso, /expiresAt > Date\.now\(\)/);
  assert.match(sso, /\/api\/sso\/session/);
  assert.match(callback, /exchangeMainAppSsoTicket/);
  assert.match(callback, /createMainAppSessionCookie/);
  assert.match(session, /validateMainAppSession/);
  assert.match(middleware, /api\/sso\/callback/);
  assert.match(middleware, /request\.nextUrl\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(middleware, /getMainAppSsoLaunchUrl/);
  assert.match(env, /MAIN_APP_SSO_EXCHANGE_URL=https:\/\/www\.qycm\.top\/api\/external-sso\/shuziren\/exchange/);
  assert.match(env, /MAIN_APP_SSO_CLIENT_SECRET=/);
  assert.match(env, /APP_SESSION_SECRET=/);
});
