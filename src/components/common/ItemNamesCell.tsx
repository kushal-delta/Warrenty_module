"use client";

import React from "react";
import { Tooltip } from "antd";

/** Separator the list APIs use to join item names (see lib/services/itemNames.ts) — item names may contain commas. */
const SEP = " || ";
const split = (names?: string | null) => String(names || "").split(SEP).map((s) => s.trim()).filter(Boolean);

/** List-table cell for a document's item names (in line order): the first item and "+N more"; hover shows every item. */
export function ItemNamesCell({ names }: { names?: string | null }) {
  const list = split(names);
  if (!list.length) return <span className="text-slate-400">—</span>;
  const body = (
    <div className="min-w-0">
      <div className="truncate text-slate-700" style={{ maxWidth: 260 }}>{list[0]}</div>
      {list.length > 1 && <div className="text-[11px] font-semibold text-blue-600">+{list.length - 1} more</div>}
    </div>
  );
  return list.length > 1 || list[0].length > 40
    ? <Tooltip title={<ol className="list-decimal pl-4 m-0">{list.map((n, i) => <li key={i}>{n}</li>)}</ol>}>{body}</Tooltip>
    : body;
}

/** Excel export / search text: every item name, one per line. */
export const itemNamesText = (names?: string | null) => split(names).join("\n");
