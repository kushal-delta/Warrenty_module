"use client";

import React, { useState } from "react";
import axios from "axios";
import { Button, Progress, Upload, message } from "antd";
import { DeleteOutlined, VideoCameraAddOutlined } from "@ant-design/icons";
import { MAX_VIDEO_MB, MAX_VIDEOS, VIDEO_ACCEPT } from "@/lib/config/service";
import { reportFormError } from "@/lib/utils/formErrors";

export interface VideoItem { AttachmentId: string; FileName: string; FileUrl: string; FileSize?: number }

const sizeLabel = (n?: number) => (!n ? "" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Plays attached videos (service call / job card views). */
export function VideoList({ videos }: { videos: VideoItem[] }) {
  if (!videos?.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {videos.map((v) => (
        <div key={v.AttachmentId} className="w-64 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
          <video src={v.FileUrl} controls preload="metadata" className="w-full h-36 rounded bg-black" />
          <a href={v.FileUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-blue-700 mt-1" title={v.FileName}>{v.FileName}</a>
          <div className="text-[11px] text-slate-400">{sizeLabel(v.FileSize)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Video picker for forms: each video is uploaded straight away (with progress) to /api/attachments/upload and
 * kept as a pending attachment; the form's save sends the ids (`videoIds`) to link them to the record.
 * `onUploadingChange` lets the form block saving while an upload is still running.
 */
export function VideoAttachments({ value, onChange, onUploadingChange, max = MAX_VIDEOS, disabled }: {
  value: VideoItem[]; onChange: (videos: VideoItem[]) => void; onUploadingChange?: (uploading: boolean) => void; max?: number; disabled?: boolean;
}) {
  const [uploads, setUploads] = useState<{ uid: string; name: string; percent: number }[]>([]);
  const busy = (list: typeof uploads) => onUploadingChange?.(list.length > 0);
  const room = max - value.length - uploads.length;
  // Latest value for uploads that finish after another change.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const upload = async (file: File, uid: string) => {
    setUploads((list) => { const next = [...list, { uid, name: file.name, percent: 0 }]; busy(next); return next; });
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await axios.post("/api/attachments/upload", body, {
        onUploadProgress: (e) => setUploads((list) => list.map((u) => (u.uid === uid ? { ...u, percent: e.total ? Math.round((e.loaded / e.total) * 100) : u.percent } : u))),
      });
      onChange([...valueRef.current, data.video]);
    } catch (err) {
      reportFormError(err, { fallback: `Could not upload ${file.name}` });
    } finally {
      setUploads((list) => { const next = list.filter((u) => u.uid !== uid); busy(next); return next; });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {value.map((v) => (
          <div key={v.AttachmentId} className="relative w-56 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
            <video src={v.FileUrl} controls preload="metadata" className="w-full h-32 rounded bg-black" />
            <div className="flex items-center justify-between gap-1 mt-1">
              <div className="min-w-0"><div className="truncate text-xs text-slate-700" title={v.FileName}>{v.FileName}</div><div className="text-[11px] text-slate-400">{sizeLabel(v.FileSize)}</div></div>
              {!disabled && <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((x) => x.AttachmentId !== v.AttachmentId))} />}
            </div>
          </div>
        ))}
        {uploads.map((u) => (
          <div key={u.uid} className="w-56 h-[10.5rem] rounded-lg border border-dashed border-slate-300 bg-white p-3 flex flex-col justify-center">
            <div className="truncate text-xs text-slate-600 mb-2" title={u.name}>{u.name}</div>
            <Progress percent={u.percent} size="small" status="active" />
            <div className="text-[11px] text-slate-400">Uploading…</div>
          </div>
        ))}
        {!disabled && room > 0 && (
          <Upload accept={VIDEO_ACCEPT} multiple showUploadList={false}
            beforeUpload={(file, list) => {
              if (list.indexOf(file) >= room) { message.warning(`Attach at most ${max} videos`); return Upload.LIST_IGNORE; }
              if (file.size > MAX_VIDEO_MB * 1024 * 1024) { message.error(`${file.name} is larger than ${MAX_VIDEO_MB} MB`); return Upload.LIST_IGNORE; }
              upload(file as unknown as File, file.uid);
              return false;
            }}>
            <div className="w-40 h-[10.5rem] rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 cursor-pointer flex flex-col items-center justify-center text-slate-500">
              <VideoCameraAddOutlined className="text-xl" /><div className="text-xs mt-1">Add videos</div>
            </div>
          </Upload>
        )}
      </div>
      <div className="text-xs text-slate-500">Optional · up to {max} videos (MP4, WebM, MOV, 3GP), {MAX_VIDEO_MB} MB each{value.length ? ` · ${value.length} attached` : ""}</div>
    </div>
  );
}
