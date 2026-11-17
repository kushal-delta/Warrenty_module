"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Tooltip } from "antd";

export type DocSeqKey = "MATREQ" | "MATISSUE" | "DCHALLAN" | "CHGRN" | "DCRETURN" | "JOBCARD" | "VISIT" | "REPL" | "COMPLAINT";

/**
 * Number a new document will get (preview from /api/masters/next-doc-no). Loads each time `enabled` turns true
 * (drawer opened for a new record); null while loading, when disabled, or if it cannot be read.
 */
export function useNextDocNo(key: DocSeqKey, enabled: boolean) {
  const [docNo, setDocNo] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setDocNo(null); return; }
    let alive = true;
    axios.post("/api/masters/next-doc-no", { key }).then(({ data }) => { if (alive) setDocNo(data.docNo || null); }).catch(() => { if (alive) setDocNo(null); });
    return () => { alive = false; };
  }, [key, enabled]);
  return docNo;
}

/**
 * Document number pill for drawer / modal headers.
 *   preview — true for a new record: the number is what saving will assign (it can move on if someone else saves first).
 *   onLight — for white headers (modals); the default suits the blue drawer header.
 */
export function DocNoChip({ docNo, preview = false, onLight = false }: { docNo?: string | null; preview?: boolean; onLight?: boolean }) {
  if (!docNo) return null;
  const chip = (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[13px] font-bold tracking-wide whitespace-nowrap shadow-sm ${
      onLight ? "border border-blue-200 bg-blue-50 text-blue-700" : "border border-white/40 bg-white text-blue-700"}`}>
      {docNo}
    </span>
  );
  return preview
    ? <Tooltip title="Auto-generated — this number is assigned when you save">{chip}</Tooltip>
    : chip;
}
