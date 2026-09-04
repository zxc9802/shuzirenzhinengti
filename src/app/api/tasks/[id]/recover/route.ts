import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/lib/store/task-store";
import { isTaskOutputDeliverable, toPublicTask } from "@/lib/server/public-data";
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

  if (isTaskOutputDeliverable(task) && task.results?.finalVideoUrl) {
    return NextResponse.json({ success: true, task: toPublicTask(task), alreadyCompleted: true });
  }

  if (!isRecoverableLipsyncTask(task)) {
    return NextResponse.json(
      { error: "这个任务还没有已扣费的对口型结果，不能免费恢复" },
      { status: 400 }
    );
  }

  try {
    const recovered = await recoverStuckLipsyncTask(id, access.session?.token);
    return NextResponse.json({ success: true, task: toPublicTask(recovered) });
  } catch (err: any) {
    return NextResponse.json(
      { error: "恢复失败，请稍后重试" },
      { status: 500 }
    );
  }
}
