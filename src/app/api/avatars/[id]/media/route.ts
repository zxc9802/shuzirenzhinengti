import { NextRequest } from "next/server";
import { AvatarStore } from "@/lib/store/avatar-store";
import { servePrivateMedia } from "@/lib/server/media-response";
import { isOwnedUploadSource } from "@/lib/server/upload-policy";
import {
  canViewAllMedia,
  mediaNotFoundResponse,
  resolveAccessContext,
  unauthorizedResponse,
} from "@/lib/access-control";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await resolveAccessContext(req);
  if (access.isolated && !access.userId) return unauthorizedResponse();

  const { id } = await params;
  const avatar = AvatarStore.get(id);
  if (!avatar || (!canViewAllMedia(access) && avatar.userId !== access.userId)) {
    return mediaNotFoundResponse();
  }

  const kind = req.nextUrl.searchParams.get("kind");
  if (kind === "cover") {
    if (!isOwnedUploadSource({ source: avatar.coverUrl, userId: avatar.userId, folder: "thumbnails" })) {
      return mediaNotFoundResponse();
    }
    return servePrivateMedia(req, avatar.coverUrl, { contentType: "image/jpeg" });
  }
  const videoSource = avatar.videoPath || avatar.videoUrl;
  if (!isOwnedUploadSource({ source: videoSource, userId: avatar.userId, folder: "videos" })) {
    return mediaNotFoundResponse();
  }
  return servePrivateMedia(req, videoSource, { contentType: "video/mp4" });
}
