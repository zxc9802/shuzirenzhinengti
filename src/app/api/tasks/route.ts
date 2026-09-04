import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import { runDigitalHumanPipeline } from "@/lib/engine/pipeline";
import { AvatarStore } from "@/lib/store/avatar-store";
import { VoiceStore } from "@/lib/store/voice-store";
import { resolvePrivateEngine, toPublicTask } from "@/lib/server/public-data";
import type { MainAppUser } from "@/lib/main-app-sso";
import {
  estimateTaskDuration,
  reserveMainAppCredits,
  MainAppBillingError,
  POINTS_PER_SECOND,
  CNY_PER_SECOND,
} from "@/lib/main-app-billing";
import {
  resolveAccessContext,
  unauthorizedResponse,
  canViewAllMedia,
} from "@/lib/access-control";
import { isOwnedUploadSource } from "@/lib/server/upload-policy";
import { isTrustedStoredMediaSource } from "@/lib/server/media-response";

export async function GET(req: NextRequest) {
  const access = await resolveAccessContext(req);
  if (access.isolated && !access.userId) {
    return unauthorizedResponse();
  }

  const tasks = await TaskStore.getAllAsync();
  const visibleTasks = access.isolated && !access.isAdmin
    ? tasks.filter((task) => task.userId === access.userId)
    : tasks;
  return NextResponse.json({ tasks: visibleTasks.map(toPublicTask) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      avatarId,
      scriptText,
      toneProfile = "low",
      videoFit = "smart",
      emotionIntensity = 0.8,
      speakerVoiceId,
      engine,
    } = body;

    if (!avatarId || !scriptText) {
      return NextResponse.json(
        { error: "缺少口播形象或文本内容" },
        { status: 400 }
      );
    }

    // 1. Resolve SSO User Session（SSO 已配置时必须持有效会话，防止伪造 x-user-id 扣他人积分）
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.session) {
      return unauthorizedResponse();
    }
    const session = access.session;
    const user: Partial<MainAppUser> = session?.user || {
      id: "local_user",
      account: "local@qycm.top",
      nickname: "本地用户",
      role: "admin",
      billingAudience: "internal",
    };

    const avatar = AvatarStore.get(String(avatarId));
    if (
      !avatar ||
      (!canViewAllMedia(access) && avatar.userId !== access.userId)
    ) {
      return NextResponse.json({ error: "口播形象不存在" }, { status: 404 });
    }

    const selectedVoice = speakerVoiceId
      ? VoiceStore.get(String(speakerVoiceId))
      : VoiceStore.getDefault();
    if (
      !selectedVoice ||
      (!selectedVoice.isDefault &&
        !canViewAllMedia(access) &&
        selectedVoice.userId !== access.userId)
    ) {
      return NextResponse.json({ error: "音色不存在" }, { status: 404 });
    }

    const avatarSource = avatar.videoPath || avatar.videoUrl;
    if (!isOwnedUploadSource({ source: avatarSource, userId: avatar.userId, folder: "videos" })) {
      return NextResponse.json({ error: "口播形象素材无效，请重新上传" }, { status: 400 });
    }
    const voiceSource = selectedVoice.audioPath || selectedVoice.audioUrl;
    const voiceIsTrusted = selectedVoice.isDefault
      ? await isTrustedStoredMediaSource(voiceSource, true)
      : isOwnedUploadSource({ source: voiceSource, userId: selectedVoice.userId, folder: "voices" });
    if (!voiceIsTrusted) {
      return NextResponse.json({ error: "音色素材无效，请重新上传" }, { status: 400 });
    }

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
        avatarId: avatar.id,
        videoName: avatar.name || "口播素材.mp4",
        videoPath: avatar.videoPath || "",
        videoUrl: avatar.videoUrl,
        scriptText,
        toneProfile,
        videoFit,
        emotionIntensity,
        speakerVoiceId: selectedVoice.id,
        speakerAudioUrl: voiceSource,
        lipsyncProvider: resolvePrivateEngine(engine),
      },
      results: {},
    });

    // Run pipeline asynchronously in background
    runDigitalHumanPipeline(task.id, session?.token).catch((err) => {
      console.error(`Task ${task.id} pipeline crashed:`, err);
    });

    return NextResponse.json({ success: true, task: toPublicTask(task) });
  } catch (err: any) {
    if (err instanceof MainAppBillingError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: "创建任务失败，请稍后重试" },
      { status: 500 }
    );
  }
}
