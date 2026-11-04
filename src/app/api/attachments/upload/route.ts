import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { purgePendingUploads, savePendingVideo } from "@/lib/services/attachments";
import { MAX_VIDEO_MB } from "@/lib/config/service";

/**
 * Video upload (multipart/form-data, field "file"; MP4 / WebM / MOV / 3GP up to MAX_VIDEO_MB).
 * Videos are too large for the JSON photo payloads, so they are uploaded first and stored as pending attachments;
 * the service call / job card save then links them with `videoIds`. Unsaved uploads are removed after a day.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return fail("Choose a video file to upload");
    await purgePendingUploads(runQuery).catch(() => undefined);
    const video = await savePendingVideo(runQuery, file as File, MAX_VIDEO_MB * 1024 * 1024, user.UserId);
    return NextResponse.json({ success: true, video });
  } catch (err) {
    return handleApiError(err, "Failed to upload the video");
  }
}
