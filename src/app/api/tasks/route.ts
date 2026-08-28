import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import { runDigitalHumanPipeline } from "@/lib/engine/pipeline";
import { getAppConfig } from "@/lib/config";
import { isLipsyncProvider } from "@/lib/lipsync-provider";
import {
  getMainAppSessionCookieName,
  readMainAppSessionCookie,
  isSsoConfigured,
  type MainAppUser,
} from "@/lib/main-app-sso";
import {
  estimateTaskDuration,
  reserveMainAppCredits,
  MainAppBillingError,
  POINTS_PER_SECOND,
  CNY_PER_SECOND,
} from "@/lib/main-app-billing";

export async function GET() {
  const tasks = await TaskStore.getAllAsync();
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      videoName,
      videoPath,
      videoUrl,
      scriptText,
      toneProfile = "low",
      videoFit = "smart",
      emotionIntensity = 0.8,
      speakerVoiceId,
      speakerAudioUrl,
      emotionAudioUrl,
      lipsyncProvider,
    } = body;

    if ((!videoPath && !videoUrl) || !scriptText) {
      return NextResponse.json(
        { error: "缺少视频文件或文本内容" },
        { status: 400 }
      );
    }

    // 1. Resolve SSO User Session
    const cookieValue = req.cookies.get(getMainAppSessionCookieName())?.value;
    const session = await readMainAppSessionCookie(cookieValue);
    const user: Partial<MainAppUser> = session?.user || {
      id: req.headers.get("x-user-id") || "local_user",
      account: req.headers.get("x-user-account") || "local@qycm.top",
      nickname: "本地用户",
      role: isSsoConfigured() ? "user" : "admin",
      billingAudience: isSsoConfigured() ? "external" : "internal",
    };

    // 2. Estimate Task Duration and Reserve Credits (200 points/s for external users)
    const estimatedDuration = estimateTaskDuration({ scriptText });
    const reservation = await reserveMainAppCredits({
      user,
      sessionToken: session?.token,
      estimatedDuration,
    });

    const task = TaskStore.create({
      userId: user.id,
      userAccount: user.account,
      status: "pending",
      step: "idle",
      progress: 0,
      billing: {
        isExternalUser: reservation.chargeRequired,
        ratePerSecond: POINTS_PER_SECOND,
        costCnyPerSecond: CNY_PER_SECOND,
        requestId: reservation.requestId,
        estimatedDuration,
        estimatedPoints: reservation.requiredPoints,
        costCny: reservation.costCny,
        pointsBalanceBefore: reservation.pointsBalance,
        status: reservation.chargeRequired ? "reserved" : "not_applicable",
      },
      inputs: {
        videoName: videoName || "input.mp4",
        videoPath,
        videoUrl: videoUrl || "",
        scriptText,
        toneProfile,
        videoFit,
        emotionIntensity,
        speakerVoiceId,
        speakerAudioUrl,
        emotionAudioUrl,
        lipsyncProvider: isLipsyncProvider(lipsyncProvider)
          ? lipsyncProvider
          : getAppConfig().lipsyncProvider || "heygen",
      },
      results: {},
    });

    // Run pipeline asynchronously in background
    runDigitalHumanPipeline(task.id, session?.token).catch((err) => {
      console.error(`Task ${task.id} pipeline crashed:`, err);
    });

    return NextResponse.json({ success: true, task });
  } catch (err: any) {
    if (err instanceof MainAppBillingError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to create task" },
      { status: 500 }
    );
  }
}

