import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import { runDigitalHumanPipeline } from "@/lib/engine/pipeline";

export async function GET() {
  const tasks = TaskStore.getAll();
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
    } = body;

    if ((!videoPath && !videoUrl) || !scriptText) {
      return NextResponse.json(
        { error: "缺少视频文件或文本内容" },
        { status: 400 }
      );
    }

    const task = TaskStore.create({
      status: "pending",
      step: "idle",
      progress: 0,
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
      },
      results: {},
    });

    // Run pipeline asynchronously in background
    runDigitalHumanPipeline(task.id).catch((err) => {
      console.error(`Task ${task.id} pipeline crashed:`, err);
    });

    return NextResponse.json({ success: true, task });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create task" },
      { status: 500 }
    );
  }
}
