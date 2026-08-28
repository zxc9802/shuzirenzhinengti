import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { CosService } from "@/lib/cos";
import { TaskStore } from "@/lib/store/task-store";
import {
  canAccessTask,
  resolveAccessContext,
  taskNotFoundResponse,
  unauthorizedResponse,
} from "@/lib/access-control";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const access = await resolveAccessContext(req);
  if (access.isolated && !access.userId) {
    return unauthorizedResponse();
  }

  const { id, file } = await params;
  const safeFileName = path.basename(file);

  const task = TaskStore.get(id);
  if (!task || !canAccessTask(access, task)) {
    return taskNotFoundResponse();
  }

  if (CosService.isConfigured()) {
    const cosKey = `jobs/${id}/${safeFileName}`;
    try {
      const cosUrl = await CosService.getDownloadUrl(cosKey, safeFileName);
      return NextResponse.redirect(cosUrl, 302);
    } catch {
      // fall through to local
    }
  }

  const filePath = path.join(process.cwd(), "public", "jobs", id, safeFileName);
  if (!fs.existsSync(filePath)) {
    return new NextResponse("File not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const headers = new Headers();
  headers.set("Content-Disposition", `attachment; filename="${safeFileName}"`);
  headers.set("Content-Length", String(stat.size));
  headers.set("Cache-Control", "private, max-age=3600");

  if (safeFileName.endsWith(".mp4")) {
    headers.set("Content-Type", "video/mp4");
  } else if (safeFileName.endsWith(".wav")) {
    headers.set("Content-Type", "audio/wav");
  } else if (safeFileName.endsWith(".json")) {
    headers.set("Content-Type", "application/json");
  }

  const webStream = Readable.toWeb(fs.createReadStream(filePath));
  return new NextResponse(webStream as ReadableStream, { headers });
}
