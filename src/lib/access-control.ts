import { NextRequest, NextResponse } from "next/server";
import {
  getMainAppSessionCookieName,
  isSsoConfigured,
  readMainAppSessionCookie,
  type MainAppSession,
} from "./main-app-sso";

export interface AccessContext {
  /** SSO 已配置时启用账号隔离 */
  isolated: boolean;
  /** 当前登录的主站用户 id（未隔离时为 null） */
  userId: string | null;
  /** 管理员可跨账号访问所有任务 */
  isAdmin: boolean;
  session: MainAppSession | null;
}

/**
 * 解析当前请求的账号访问上下文。
 * - SSO 未配置（本地开发）：不隔离，行为与单机模式一致。
 * - SSO 已配置但无有效会话：isolated=true 且 userId=null，所有任务接口必须拒绝。
 */
export async function resolveAccessContext(
  req: NextRequest
): Promise<AccessContext> {
  if (!isSsoConfigured()) {
    return { isolated: false, userId: null, isAdmin: true, session: null };
  }

  const cookieValue = req.cookies.get(getMainAppSessionCookieName())?.value;
  const session = await readMainAppSessionCookie(cookieValue);
  if (!session) {
    return { isolated: true, userId: null, isAdmin: false, session: null };
  }

  return {
    isolated: true,
    userId: session.user.id,
    isAdmin: session.user.role === "admin",
    session,
  };
}

/** 任务归属校验：非隔离模式放行；管理员放行；否则必须 userId 完全一致 */
export function canAccessTask(
  ctx: AccessContext,
  task: { userId?: string | null }
): boolean {
  if (!ctx.isolated || ctx.isAdmin) return true;
  return Boolean(ctx.userId) && task.userId === ctx.userId;
}

/** 未登录时的统一 401 响应 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "请先从主站登录后再使用数字人智能体",
      code: "UNAUTHENTICATED",
    },
    { status: 401 }
  );
}

/** 非本人任务返回 404，避免泄露任务是否存在 */
export function taskNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Task not found" }, { status: 404 });
}
