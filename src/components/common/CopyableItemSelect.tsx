"use client";

import React from "react";
import { Select, Tooltip, message } from "antd";
import type { SelectProps } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/utils/clipboard";

export interface PickedItem { name?: string | null; code?: string | null; uom?: string | null }

/**
 * Item dropdown with a copy button inside it and code / UOM chips under it (as in the iERP item pickers).
 * Every Select prop is passed through, so it also works as a direct Form.Item child (value / onChange).
 *   item — details of the selected item (null / undefined when nothing is selected): the copy button copies `name`.
 */
/** Read-only item cell for line grids whose items are fixed (GRN, DC return): name + copy button, code / UOM chips. */
export function ItemInfoCell({ item }: { item: PickedItem }) {
  const name = item.name?.trim() || "";
  const copy = async () => {
    if (await copyText(name)) message.success({ content: "Item name copied", duration: 1.5 });
    else message.error("Could not copy — select the text and press Ctrl+C");
  };
  return (
    <div className="min-w-0">
      <div className="flex min-h-[var(--ant-control-height,32px)] items-center gap-1.5">
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-slate-800" title={name}>{name || "—"}</span>
        {name && (
          <Tooltip title="Copy item name">
            <button type="button" aria-label="Copy item name" onClick={copy}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors">
              <CopyOutlined className="text-[13px]" />
            </button>
          </Tooltip>
        )}
      </div>
      {(item.code || item.uom) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {item.code && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[10.5px] font-semibold text-slate-600">{item.code}</span>}
          {item.uom && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[10.5px] text-slate-500"><b className="font-semibold text-slate-600">UOM</b> {item.uom}</span>}
        </div>
      )}
    </div>
  );
}

export function CopyableItemSelect({ item, className, ...selectProps }: SelectProps & { item?: PickedItem | null }) {
  const name = item?.name?.trim() || "";
  const hasValue = selectProps.value !== undefined && selectProps.value !== null && selectProps.value !== "";
  const show = hasValue && Boolean(name);

  const copy = async () => {
    if (await copyText(name)) message.success({ content: "Item name copied", duration: 1.5 });
    else message.error("Could not copy — select the text and press Ctrl+C");
  };

  return (
    <div className="min-w-0 w-full">
      <div className="relative">
        <Select {...selectProps} className={`w-full ${show ? "item-select-copy" : ""} ${className || ""}`.trim()} />
        {show && (
          <Tooltip title="Copy item name">
            <button type="button" aria-label="Copy item name" onClick={copy} onMouseDown={(e) => e.preventDefault()}
              className="absolute top-1/2 -translate-y-1/2 right-[52px] z-[2] flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors">
              <CopyOutlined className="text-[13px]" />
            </button>
          </Tooltip>
        )}
      </div>
      {hasValue && item && (item.code || item.uom) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.code && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[10.5px] font-semibold text-slate-600">{item.code}</span>}
          {item.uom && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[10.5px] text-slate-500"><b className="font-semibold text-slate-600">UOM</b> {item.uom}</span>}
        </div>
      )}
    </div>
  );
}
