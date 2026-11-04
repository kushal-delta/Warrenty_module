import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { InputError, type Run } from "@/lib/services/apiHelpers";

/**
 * Photos attached to records (service calls today). Files live in <project>/uploads/attachments — outside
 * /public, so they are only served through GET /api/attachments/<id>, which checks the caller can see the record.
 */
export const UPLOAD_DIR = path.join(process.cwd(), "uploads", "attachments");
export const MAX_PHOTOS = 5;
const MAX_BYTES = 3 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp" };
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", ...VIDEO_TYPES };
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = ["jpg", "png", "webp", "pdf", ...Object.values(VIDEO_TYPES)];
/** Uploads not linked to a record yet (a form still open). */
export const PENDING_TABLE = "Pending";

export interface PhotoInput { fileName?: string; dataUrl: string; caption?: string }
export interface SavedPhoto { id: string; fileName: string; fileType: string; fileSize: number; filePath: string; caption: string | null }

/** Validates and writes base64 data-URL photos to disk. Call `removeSavedPhotos` if the database insert fails. */
export async function savePhotos(photos: unknown, max = MAX_PHOTOS): Promise<SavedPhoto[]> {
  if (photos == null) return [];
  if (!Array.isArray(photos)) throw new InputError("Photos must be a list");
  if (photos.length > max) throw new InputError(`Attach at most ${max} photos`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const saved: SavedPhoto[] = [];
  try {
    for (let index = 0; index < photos.length; index++) {
      const raw = (photos as PhotoInput[])[index];
      const match = String(raw?.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new InputError(`Photo ${index + 1} must be a JPEG, PNG or WebP image`);
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > MAX_BYTES) throw new InputError(`Photo ${index + 1} is larger than 3 MB`);
      const id = randomUUID(), ext = TYPES[match[1]];
      const filePath = path.join(UPLOAD_DIR, `${id}.${ext}`);
      await writeFile(filePath, bytes);
      const fileName = String(raw.fileName || `photo-${index + 1}.${ext}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
      saved.push({ id, fileName, fileType: match[1], fileSize: bytes.length, filePath, caption: raw.caption ? String(raw.caption).slice(0, 200) : null });
    }
    return saved;
  } catch (err) {
    await removeSavedPhotos(saved);
    throw err;
  }
}

/** Validates and writes base64 data-URL PDFs (replacement documents) to disk. Call `removeSavedPhotos` if the database insert fails. */
export async function savePdfs(files: unknown, max: number): Promise<SavedPhoto[]> {
  if (files == null) return [];
  if (!Array.isArray(files)) throw new InputError("Attachments must be a list");
  if (files.length > max) throw new InputError(`Attach at most ${max} PDF files`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const saved: SavedPhoto[] = [];
  try {
    for (let index = 0; index < files.length; index++) {
      const raw = (files as PhotoInput[])[index];
      const match = String(raw?.dataUrl || "").match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new InputError(`Attachment ${index + 1} must be a PDF file`);
      const bytes = Buffer.from(match[1], "base64");
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new InputError(`Attachment ${index + 1} is not a valid PDF`);
      if (bytes.length > MAX_PDF_BYTES) throw new InputError(`Attachment ${index + 1} is larger than 5 MB`);
      const id = randomUUID();
      const filePath = path.join(UPLOAD_DIR, `${id}.pdf`);
      await writeFile(filePath, bytes);
      const fileName = String(raw.fileName || `document-${index + 1}.pdf`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
      saved.push({ id, fileName, fileType: "application/pdf", fileSize: bytes.length, filePath, caption: raw.caption ? String(raw.caption).slice(0, 200) : null });
    }
    return saved;
  } catch (err) {
    await removeSavedPhotos(saved);
    throw err;
  }
}

/** Deletes the files of removed attachments (call after the database change committed). */
export async function removeAttachmentFiles(ids: string[]) {
  await Promise.all(ids.flatMap((id) => ATTACHMENT_EXTENSIONS.map((ext) => unlink(path.join(UPLOAD_DIR, `${id}.${ext}`)).catch(() => undefined))));
}

export async function removeSavedPhotos(saved: SavedPhoto[]) {
  await Promise.all(saved.map((s) => unlink(s.filePath).catch(() => undefined)));
}

export async function insertAttachments(run: Run, parentTable: string, parentId: string, saved: SavedPhoto[], userId: string) {
  for (const s of saved) {
    await run(
      `INSERT INTO dbo.[Attachments] ([AttachmentId],[ParentTable],[ParentId],[FileUrl],[FileName],[FileType],[FileSize],[Caption],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
       VALUES (@id,@parentTable,@parentId,@url,@name,@type,@size,@caption,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
      { id: s.id, parentTable, parentId, url: `/api/attachments/${s.id}`, name: s.fileName, type: s.fileType, size: s.fileSize, caption: s.caption, userId }
    );
  }
}

export async function readAttachmentFile(id: string, fileType: string) {
  return readFile(path.join(UPLOAD_DIR, `${id}.${TYPES[fileType] || "jpg"}`));
}

export const attachmentPath = (id: string, fileType: string) => path.join(UPLOAD_DIR, `${id}.${TYPES[fileType] || "jpg"}`);

/* ---------------- videos ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Video type from the browser's MIME type, or from the extension when the browser sends none (e.g. some .mov / .3gp files). */
export function videoType(mime: string, fileName: string): string | null {
  if (VIDEO_TYPES[mime]) return mime;
  const ext = fileName.toLowerCase().split(".").pop() || "";
  return Object.entries(VIDEO_TYPES).find(([, e]) => e === ext)?.[0] || null;
}

/** Writes an uploaded video and records it as a pending attachment of the uploader; it is linked to its record on save. */
export async function savePendingVideo(run: Run, file: File, maxBytes: number, userId: string) {
  const type = videoType(file.type, file.name);
  if (!type) throw new InputError("Only MP4, WebM, MOV or 3GP videos can be attached");
  if (file.size > maxBytes) throw new InputError(`Video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  if (!file.size) throw new InputError("The video file is empty");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = randomUUID(), filePath = attachmentPath(id, type);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  const fileName = String(file.name || `video.${VIDEO_TYPES[type]}`).replace(/[\/:*?"<>|]/g, "_").slice(0, 200);
  try {
    await run(`INSERT INTO dbo.[Attachments] ([AttachmentId],[ParentTable],[ParentId],[FileUrl],[FileName],[FileType],[FileSize],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
      VALUES (@id,@pending,@user,@url,@name,@type,@size,@user,@user,SYSUTCDATETIME(),SYSUTCDATETIME())`,
      { id, pending: PENDING_TABLE, user: userId, url: `/api/attachments/${id}`, name: fileName, type, size: file.size });
  } catch (err) {
    await unlink(filePath).catch(() => undefined);
    throw err;
  }
  return { AttachmentId: id, FileUrl: `/api/attachments/${id}`, FileName: fileName, FileType: type, FileSize: file.size };
}

/** Removes pending uploads older than a day (forms that were closed without saving). */
export async function purgePendingUploads(run: Run) {
  const gone = await run<any>(`DELETE FROM dbo.[Attachments] OUTPUT DELETED.[AttachmentId] AS [id] WHERE [ParentTable] = @pending AND [InsertedOn] < DATEADD(day, -1, SYSUTCDATETIME())`, { pending: PENDING_TABLE });
  await removeAttachmentFiles(gone.map((g) => String(g.id)));
}

/**
 * Makes a record's videos equal to `videoIds` (call inside the save transaction): existing videos not listed are removed,
 * listed pending uploads of this user are linked to the record. `videoIds` undefined = leave the videos as they are.
 * Returns the ids whose files must be deleted after the commit.
 */
export async function syncVideos(run: Run, parentTable: string, parentId: string, videoIds: unknown, userId: string, max: number): Promise<string[]> {
  if (videoIds === undefined || videoIds === null) return [];
  if (!Array.isArray(videoIds)) throw new InputError("videoIds must be a list");
  const ids = Array.from(new Set(videoIds.map(String))).filter((id) => UUID.test(id));
  if (ids.length > max) throw new InputError(`Attach at most ${max} videos`);
  const existing = (await run<any>(`SELECT [AttachmentId] FROM dbo.[Attachments] WHERE [ParentTable] = @table AND [ParentId] = @parent AND [FileType] LIKE 'video/%'`, { table: parentTable, parent: parentId }))
    .map((r) => String(r.AttachmentId).toLowerCase());
  const wanted = new Set(ids.map((id) => id.toLowerCase()));
  const removed: string[] = [];
  for (const id of existing.filter((e) => !wanted.has(e))) {
    await run(`DELETE FROM dbo.[Attachments] WHERE [AttachmentId] = @id AND [ParentTable] = @table AND [ParentId] = @parent`, { id, table: parentTable, parent: parentId });
    removed.push(id);
  }
  for (const id of ids.filter((i) => !existing.includes(i.toLowerCase()))) {
    const linked = await run(`UPDATE dbo.[Attachments] SET [ParentTable] = @table, [ParentId] = @parent, [LastUpdatedOn] = SYSUTCDATETIME() OUTPUT INSERTED.[AttachmentId]
      WHERE [AttachmentId] = @id AND [ParentTable] = @pending AND [InsertedByUserId] = @user AND [FileType] LIKE 'video/%'`, { id, table: parentTable, parent: parentId, pending: PENDING_TABLE, user: userId });
    if (!linked.length) throw new InputError("A video upload has expired or was not found — please attach the video again");
  }
  return removed;
}
