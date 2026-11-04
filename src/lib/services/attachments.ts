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
/** Phone cameras send uncompressed photos of 4–8 MB (the web form compresses first; a mobile app may not). */
const MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp" };
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", ...VIDEO_TYPES };
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = ["jpg", "png", "webp", "pdf", ...Object.values(VIDEO_TYPES)];
/** Uploads not linked to a record yet (a form still open). */
export const PENDING_TABLE = "Pending";

export interface PhotoInput { fileName?: string; dataUrl: string; caption?: string }
export interface SavedPhoto { id: string; fileName: string; fileType: string; fileSize: number; filePath: string; caption: string | null }

/** Image type from the file's first bytes (JPEG / PNG / WebP), "heic" for an iPhone HEIC photo, or null. */
function sniffImage(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|heif|mif1|msf1)/.test(bytes.subarray(8, 12).toString("latin1"))) return "heic";
  return null;
}

/**
 * Reads one photo as sent by the web form or a mobile app. Accepted: a data URL ("data:image/jpeg;base64,…",
 * also image/jpg, with line breaks in the base64) or plain base64 in `dataUrl` / `base64`. The real type is taken
 * from the file's own bytes, so a wrong or missing MIME type from a phone does not matter.
 */
function photoBytes(raw: PhotoInput & { base64?: string }, index: number) {
  const text = String(raw?.dataUrl || raw?.base64 || "").trim();
  const comma = text.startsWith("data:") ? text.indexOf(",") : -1;
  const b64 = (comma >= 0 ? text.slice(comma + 1) : text).replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/=_-]+$/.test(b64)) throw new InputError(`Photo ${index + 1} must be a JPEG, PNG or WebP image`);
  const bytes = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const type = sniffImage(bytes);
  if (type === "heic") throw new InputError(`Photo ${index + 1} is a HEIC photo — send it as JPEG (set the camera / picker to JPEG or "Most compatible")`);
  if (!type) throw new InputError(`Photo ${index + 1} must be a JPEG, PNG or WebP image`);
  return { bytes, type };
}

/** Validates and writes photos (base64 / data URL, from the web form or a mobile app) to disk. Call `removeSavedPhotos` if the database insert fails. */
export async function savePhotos(photos: unknown, max = MAX_PHOTOS): Promise<SavedPhoto[]> {
  if (photos == null) return [];
  if (!Array.isArray(photos)) throw new InputError("Photos must be a list");
  if (photos.length > max) throw new InputError(`Attach at most ${max} photos`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const saved: SavedPhoto[] = [];
  try {
    for (let index = 0; index < photos.length; index++) {
      const raw = (photos as PhotoInput[])[index];
      const { bytes, type } = photoBytes(raw, index);
      if (bytes.length > MAX_BYTES) throw new InputError(`Photo ${index + 1} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
      const id = randomUUID(), ext = TYPES[type];
      const filePath = path.join(UPLOAD_DIR, `${id}.${ext}`);
      await writeFile(filePath, bytes);
      const fileName = String(raw.fileName || `photo-${index + 1}.${ext}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
      saved.push({ id, fileName, fileType: type, fileSize: bytes.length, filePath, caption: raw.caption ? String(raw.caption).slice(0, 200) : null });
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
/** Other names phones and pickers use for the same formats (m4v is MP4, 3g2 is 3GP). */
const VIDEO_ALIASES: Record<string, string> = { "video/x-m4v": "video/mp4", "video/m4v": "video/mp4", "video/mpeg4": "video/mp4", "video/3gpp2": "video/3gpp", "video/x-quicktime": "video/quicktime" };
const VIDEO_EXT_ALIASES: Record<string, string> = { m4v: "video/mp4", "3g2": "video/3gpp", qt: "video/quicktime" };

/** Video type from the browser's / app's MIME type, or from the extension when it sends none or a generic one (e.g. some .mov / .3gp files). */
export function videoType(mime: string, fileName: string): string | null {
  const m = String(mime || "").toLowerCase().split(";")[0].trim();
  if (VIDEO_TYPES[m]) return m;
  if (VIDEO_ALIASES[m]) return VIDEO_ALIASES[m];
  const ext = String(fileName || "").toLowerCase().split(".").pop() || "";
  return Object.entries(VIDEO_TYPES).find(([, e]) => e === ext)?.[0] || VIDEO_EXT_ALIASES[ext] || null;
}

/** Video type from the file's own header (MP4 / MOV / 3GP "ftyp" box, WebM EBML) — for apps that send "video" or "application/octet-stream". */
function sniffVideo(head: Buffer): string | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  if (head.length >= 12 && head.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = head.subarray(8, 12).toString("latin1");
    if (brand === "qt  ") return "video/quicktime";
    if (brand.startsWith("3g")) return "video/3gpp";
    return "video/mp4";
  }
  return null;
}

/** Writes an uploaded video and records it as a pending attachment of the uploader; it is linked to its record on save. */
export async function savePendingVideo(run: Run, file: File, maxBytes: number, userId: string) {
  if (file.size > maxBytes) throw new InputError(`Video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  if (!file.size) throw new InputError("The video file is empty");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = videoType(file.type, file.name) || sniffVideo(bytes.subarray(0, 16));
  if (!type) throw new InputError("Only MP4, WebM, MOV or 3GP videos can be attached");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = randomUUID(), filePath = attachmentPath(id, type);
  await writeFile(filePath, bytes);
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
