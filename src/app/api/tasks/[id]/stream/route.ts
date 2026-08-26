import { NextRequest } from "next/server";
import { TaskStore, TaskItem } from "@/lib/store/task-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = TaskStore.get(id);

  if (!task) {
    return new Response("Task not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(TaskStore.get(id))}\n\n`)
      );

      const unsubscribe = TaskStore.subscribe(id, (updatedTask: TaskItem) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(updatedTask)}\n\n`)
        );
        if (updatedTask.status === "completed" || updatedTask.status === "failed") {
          // keep connection or can close later
        }
      });

      req.signal.addEventListener("abort", () => {
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
