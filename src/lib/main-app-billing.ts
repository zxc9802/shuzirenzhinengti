import { randomUUID } from "node:crypto";
import {
  getMainAppSessionCookieName,
  getMainAppUrl,
  readMainAppSessionCookie,
  type MainAppSession,
  type MainAppUser,
} from "./main-app-sso";

export const POINTS_PER_SECOND = 200;
export const CNY_PER_SECOND = 0.2;
export const POINTS_PER_CNY = 1000;
export const CHARACTERS_PER_SECOND = 4.4;

export class MainAppBillingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 400,
    code = "MAIN_APP_BILLING_ERROR",
  ) {
    super(message);
    this.name = "MainAppBillingError";
    this.status = status;
    this.code = code;
  }
}

/**
 * 判断用户是否为需要按 200 积分/秒计费的主站外部注册用户
 */
export function isExternallyBilledUser(
  user?: Partial<MainAppUser> | null,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return false;
  if (
    user.billingAudience === "internal" ||
    user.groupName === "内部用户" ||
    user.groupName === "管理员"
  ) {
    return false;
  }
  if (
    user.billingAudience === "external" ||
    user.groupName === "外部用户"
  ) {
    return true;
  }
  // 默认普通注册用户均视为外部计费用户
  return user.role !== "admin";
}

/**
 * 根据视频/音频时长计算所需积分（200 积分/秒，向上取整）
 */
export function calculateRequiredPoints(durationSeconds: number): number {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  return Math.ceil(seconds * POINTS_PER_SECOND);
}

/**
 * 根据视频/音频时长计算人民币金额（0.20 元/秒）
 */
export function calculateCostCny(durationSeconds: number): number {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  return Number((seconds * CNY_PER_SECOND).toFixed(2));
}

/**
 * 根据文本字数预估语音口播时长（约 4.4 字/秒，最低 3 秒）
 */
export function estimateScriptDuration(scriptText: string): number {
  const text = (scriptText || "").trim();
  if (!text) return 0;
  return Math.max(3, Math.ceil(text.length / CHARACTERS_PER_SECOND));
}

/**
 * 综合输入预估任务时长（优先使用已知视频时长或文案预估）
 */
export function estimateTaskDuration(inputs: {
  scriptText?: string;
  videoDuration?: number;
}): number {
  if (inputs.videoDuration && inputs.videoDuration > 0) {
    return Number(inputs.videoDuration.toFixed(1));
  }
  if (inputs.scriptText) {
    return estimateScriptDuration(inputs.scriptText);
  }
  return 5;
}

/**
 * 获取当前请求中的 SSO 用户及会话
 */
export async function getCurrentSsoSession(
  cookieValue?: string,
): Promise<MainAppSession | null> {
  if (cookieValue) {
    return readMainAppSessionCookie(cookieValue);
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const val = cookieStore.get(getMainAppSessionCookieName())?.value;
    return readMainAppSessionCookie(val);
  } catch {
    return null;
  }
}

interface BillingRequestOptions {
  action: "reserve" | "settle" | "release";
  userId: string;
  requestId: string;
  operation?: string;
  durationSeconds?: number;
  points?: number;
  token?: string;
}

async function postBillingApi(
  options: BillingRequestOptions,
): Promise<{ success: boolean; data?: any; error?: string; code?: string }> {
  const clientSecret = process.env.MAIN_APP_SSO_CLIENT_SECRET?.trim();
  const mainAppUrl = getMainAppUrl();

  const body = {
    product: "shuziren",
    userId: options.userId,
    action: options.action,
    requestId: options.requestId,
    operation: options.operation || "lipsync_digital_human",
    duration: options.durationSeconds,
    billableUnits: options.durationSeconds,
    ratePerSecond: POINTS_PER_SECOND,
    points: options.points,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientSecret) {
    headers["x-qycm-sso-client-secret"] = clientSecret;
  }
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(`${mainAppUrl}/api/sso/billing`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      data?: any;
      error?: string;
      message?: string;
      code?: string;
    };

    if (!response.ok || payload.success === false) {
      const errorMsg =
        payload.error ||
        payload.message ||
        `主站积分结算服务异常 (HTTP ${response.status})`;
      return {
        success: false,
        error: errorMsg,
        code: payload.code || `HTTP_${response.status}`,
      };
    }

    return {
      success: true,
      data: payload.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "连接主站积分服务超时",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * 任务启动前预留/冻结积分
 */
export async function reserveMainAppCredits(input: {
  user: Partial<MainAppUser>;
  sessionToken?: string;
  taskId?: string;
  estimatedDuration: number;
}): Promise<{
  requestId: string;
  chargeRequired: boolean;
  requiredPoints: number;
  estimatedDuration: number;
  costCny: number;
  pointsBalance?: number;
}> {
  const chargeRequired = isExternallyBilledUser(input.user);
  const requiredPoints = chargeRequired
    ? calculateRequiredPoints(input.estimatedDuration)
    : 0;
  const costCny = chargeRequired
    ? calculateCostCny(input.estimatedDuration)
    : 0;
  const requestId = randomUUID();

  if (!chargeRequired || !input.user.id) {
    return {
      requestId,
      chargeRequired: false,
      requiredPoints: 0,
      estimatedDuration: input.estimatedDuration,
      costCny: 0,
    };
  }

  // 调用主站进行积分预留
  const result = await postBillingApi({
    action: "reserve",
    userId: input.user.id,
    requestId,
    durationSeconds: input.estimatedDuration,
    points: requiredPoints,
    token: input.sessionToken,
  });

  if (!result.success) {
    if (
      result.code === "INSUFFICIENT_CREDITS" ||
      result.code === "INSUFFICIENT_POINTS" ||
      (result.error && result.error.includes("余额不足"))
    ) {
      throw new MainAppBillingError(
        `积分余额不足：本次生成预计约 ${input.estimatedDuration} 秒，需消耗 ${requiredPoints} 积分（0.20元/秒），请充值后再试。`,
        402,
        "INSUFFICIENT_POINTS",
      );
    }
    // 其他错误或主站未配置时记录但不阻断本地测试环境
    if (process.env.NODE_ENV === "development" && !process.env.MAIN_APP_SSO_CLIENT_SECRET) {
      console.warn("[Billing] Dev mode: billing reserve failed, skipped.", result.error);
    } else {
      throw new MainAppBillingError(
        result.error || "主站积分预留失败",
        400,
        result.code || "BILLING_RESERVE_FAILED",
      );
    }
  }

  return {
    requestId,
    chargeRequired: true,
    requiredPoints,
    estimatedDuration: input.estimatedDuration,
    costCny,
    pointsBalance: result.data?.pointsBalance,
  };
}

/**
 * 任务完成后按最终视频实际时长实扣结算积分
 */
export async function settleMainAppCredits(input: {
  userId: string;
  requestId: string;
  actualDuration: number;
  chargedPoints?: number;
  sessionToken?: string;
}): Promise<{
  chargedPoints: number;
  costCny: number;
  actualDuration: number;
  pointsBalance?: number;
}> {
  const actualDuration = Math.max(0.1, Number(input.actualDuration) || 0);
  const chargedPoints =
    input.chargedPoints ?? calculateRequiredPoints(actualDuration);
  const costCny = calculateCostCny(actualDuration);

  if (!input.userId || !input.requestId) {
    return { chargedPoints, costCny, actualDuration };
  }

  const result = await postBillingApi({
    action: "settle",
    userId: input.userId,
    requestId: input.requestId,
    durationSeconds: actualDuration,
    points: chargedPoints,
    token: input.sessionToken,
  });

  return {
    chargedPoints,
    costCny,
    actualDuration,
    pointsBalance: result.data?.pointsBalance,
  };
}

/**
 * 任务失败时全额解冻释放预留积分
 */
export async function releaseMainAppCredits(input: {
  userId: string;
  requestId: string;
  sessionToken?: string;
}): Promise<void> {
  if (!input.userId || !input.requestId) return;

  await postBillingApi({
    action: "release",
    userId: input.userId,
    requestId: input.requestId,
    token: input.sessionToken,
  });
}
