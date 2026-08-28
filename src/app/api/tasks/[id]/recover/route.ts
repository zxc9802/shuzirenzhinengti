import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import {
  isRecoverableLipsyncTask,
  recoverStuckLipsyncTask,
} from "@/lib/engine/recover-lipsync";
import {
  canAccessTask,
  resolveAccessContext,
  taskNotFoundResponse,
  unauthorizedResponse,
} from "@/lib/access-control";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await resolveAccessContext(req);
  if (access.isolated && !access.userId) {
    return unauthorizedResponse();
  }

  const { id } = await params;
  const task = (await TaskStore.getAsync(id)) || TaskStore.get(id);
  if (!task || !canAccessTask(access, task)) {
    return taskNotFoundResponse();
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
