import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import {
  isRecoverableLipsyncTask,
  recoverStuckLipsyncTask,
} from "@/lib/engine/recover-lipsync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = (await TaskStore.getAsync(id)) || TaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  if (task.status === "completed" && task.results?.finalVideoUrl) {
    return NextResponse.json({ success: true, task, alreadyCompleted: true });
  }

  if (!isRecoverableLipsyncTask(task)) {
    return NextResponse.json(
      { error: "这个任务还没有已扣费的对口型结果，不能免费恢复" },
      { status: 400 }
    );
  }

  try {
    const recovered = await recoverStuckLipsyncTask(id);
    return NextResponse.json({ success: true, task: recovered });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "恢复失败" },
      { status: 500 }
    );
  }
}
