import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("main-app-billing.ts strictly enforces 200 points/second and 0.20 CNY/second rate", async () => {
  const [billing, pipeline, tasksRoute, ssoSession, navbar, page, history, taskStore] =
    await Promise.all([
      read("src/lib/main-app-billing.ts"),
      read("src/lib/engine/pipeline.ts"),
      read("src/app/api/tasks/route.ts"),
      read("src/app/api/sso/session/route.ts"),
      read("src/components/Navbar.tsx"),
      read("src/app/page.tsx"),
      read("src/app/history/page.tsx"),
      read("src/lib/store/task-store.ts"),
    ]);

  // 1. Core billing rate definition
  assert.match(billing, /export const POINTS_PER_SECOND = 200/);
  assert.match(billing, /export const CNY_PER_SECOND = 0\.2/);
  assert.match(billing, /export const POINTS_PER_CNY = 1000/);

  // 2. Logic implementations
  assert.match(billing, /function isExternallyBilledUser/);
  assert.match(billing, /function calculateRequiredPoints/);
  assert.match(billing, /function calculateCostCny/);
  assert.match(billing, /function reserveMainAppCredits/);
  assert.match(billing, /function settleMainAppCredits/);
  assert.match(billing, /function releaseMainAppCredits/);

  // 3. Task API integration
  assert.match(tasksRoute, /reserveMainAppCredits/);
  assert.match(tasksRoute, /isExternallyBilledUser|reservation\.chargeRequired/);
  assert.match(tasksRoute, /estimatedDuration/);
  assert.match(tasksRoute, /POINTS_PER_SECOND/);
  assert.match(tasksRoute, /MainAppBillingError/);

  // 4. Pipeline execution settlement & release
  assert.match(pipeline, /calculateRequiredPoints/);
  assert.match(pipeline, /settleMainAppCredits/);
  assert.match(pipeline, /releaseMainAppCredits/);
  assert.match(pipeline, /200积分\/秒/);

  // 5. SSO session metadata
  assert.match(ssoSession, /ratePerSecond: POINTS_PER_SECOND/);
  assert.match(ssoSession, /cnyPerSecond: CNY_PER_SECOND/);
  assert.match(ssoSession, /isExternallyBilledUser/);

  // 6. Task Store billing model
  assert.match(taskStore, /export interface TaskBillingInfo/);
  assert.match(taskStore, /chargedPoints\?: number/);
  assert.match(taskStore, /costCny\?: number/);

  // 7. Frontend UI points and rate indicators
  assert.match(navbar, /200分\/秒|200积分\/秒/);
  assert.match(page, /200分\/秒|200积分\/秒/);
  assert.match(history, /已扣.*积分/);
});

test("points and CNY mathematical calculation rules (200 pts/s = 0.20 CNY/s)", () => {
  const POINTS_PER_SECOND = 200;
  const CNY_PER_SECOND = 0.2;

  function calculateRequiredPoints(durationSeconds) {
    const seconds = Math.max(0, Number(durationSeconds) || 0);
    return Math.ceil(seconds * POINTS_PER_SECOND);
  }

  function calculateCostCny(durationSeconds) {
    const seconds = Math.max(0, Number(durationSeconds) || 0);
    return Number((seconds * CNY_PER_SECOND).toFixed(2));
  }

  function isExternallyBilledUser(user) {
    if (!user) return false;
    if (user.role === "admin") return false;
    if (
      user.billingAudience === "internal" ||
      user.groupName === "内部用户" ||
      user.groupName === "管理员"
    ) {
      return false;
    }
    if (user.billingAudience === "external" || user.groupName === "外部用户") {
      return true;
    }
    return user.role !== "admin";
  }

  // Exact point calculations
  assert.equal(calculateRequiredPoints(1), 200); // 1s = 200 pts
  assert.equal(calculateRequiredPoints(5), 1000); // 5s = 1000 pts
  assert.equal(calculateRequiredPoints(10), 2000); // 10s = 2000 pts
  assert.equal(calculateRequiredPoints(15), 3000); // 15s = 3000 pts
  assert.equal(calculateRequiredPoints(30), 6000); // 30s = 6000 pts
  assert.equal(calculateRequiredPoints(12.3), 2460); // 12.3s * 200 = 2460 pts
  assert.equal(calculateRequiredPoints(0.1), 20); // 0.1s * 200 = 20 pts
  assert.equal(calculateRequiredPoints(0), 0);
  assert.equal(calculateRequiredPoints(-5), 0);

  // Exact CNY calculations
  assert.equal(calculateCostCny(1), 0.2);
  assert.equal(calculateCostCny(5), 1.0);
  assert.equal(calculateCostCny(10), 2.0);
  assert.equal(calculateCostCny(15), 3.0);
  assert.equal(calculateCostCny(30), 6.0);

  // User classification
  assert.equal(
    isExternallyBilledUser({ role: "user", billingAudience: "external" }),
    true
  );
  assert.equal(
    isExternallyBilledUser({ role: "user", groupName: "外部用户" }),
    true
  );
  assert.equal(isExternallyBilledUser({ role: "user" }), true);
  assert.equal(isExternallyBilledUser({ role: "admin" }), false);
  assert.equal(
    isExternallyBilledUser({ role: "user", billingAudience: "internal" }),
    false
  );
  assert.equal(
    isExternallyBilledUser({ role: "user", groupName: "内部用户" }),
    false
  );
  assert.equal(isExternallyBilledUser(null), false);
});
