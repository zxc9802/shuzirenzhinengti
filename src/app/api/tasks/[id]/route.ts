import { NextRequest, NextResponse } from "next/server";
import { CosService } from "@/lib/cos";
import { recoverStuckLipsyncTask } from "@/lib/engine/recover-lipsync";
import { TaskStore } from "@/lib/store/task-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let task = await TaskStore.getAsync(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const stuckDownloading =
    task.status === "processing" &&
    !task.results?.finalVideoUrl &&
    (task.step === "mcp_lipsync_submit" || task.step === "finalize") &&
    ((task.logs || []).some((entry) => entry.message.includes("正在下载成片")) ||
      Boolean(
        task.results?.heygenLipsyncId ||
          task.results?.pixverseResultUrl ||
          task.results?.veedResultUrl
      ));

  if (stuckDownloading && CosService.isConfigured()) {
    try {
      const hasFinal = await CosService.objectExists(`jobs/${id}/final.mp4`);
      if (hasFinal) {
        task = await recoverStuckLipsyncTask(id);
      }
    } catch (err) {
      console.warn("Auto-recover from COS skipped:", err);
    }
  }

  return NextResponse.json({ task });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = TaskStore.delete(id);
  return NextResponse.json({ success: deleted });
}
