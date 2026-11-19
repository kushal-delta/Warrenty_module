"use client";

import React, { useRef, useState } from "react";
import axios from "axios";
import { Button, Input, Select, message } from "antd";
import type { InputRef } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { reportFormError } from "@/lib/utils/formErrors";

/**
 * Dropdown over a TextLists group with an "Add new …" footer — the new value is saved to Configuration → Text Lists,
 * added to the options and selected. Works directly as a Form.Item child (value / onChange).
 */
export function TextListSelect({ value, onChange, options, group, noun, placeholder, disabled, onAdded }: {
  value?: string; onChange?: (v?: string) => void; options: string[]; group: string; noun: string; placeholder?: string; disabled?: boolean; onAdded?: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<InputRef>(null);
  const add = async () => {
    const text = draft.trim();
    if (!text) { draftRef.current?.focus(); return; }
    setBusy(true);
    try {
      const { data } = await axios.post("/api/stock/challans/textlists", { group, value: text });
      onAdded?.(data.value);
      onChange?.(data.value);
      setDraft(""); setAdding(false);
      message.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} added`);
    } catch (err) {
      reportFormError(err, { fallback: `Could not add the ${noun}` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Select showSearch allowClear value={value} onChange={onChange} disabled={disabled} placeholder={placeholder || `Select ${noun}`} optionFilterProp="label"
      options={options.map((o) => ({ value: o, label: o }))}
      onOpenChange={(open) => { if (!open) { setAdding(false); setDraft(""); } }}
      popupRender={(menu) => (
        <>
          {menu}
          <div className="mt-1 border-t border-slate-100 p-1.5">
            {adding
              ? <div className="flex gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
                  <Input ref={draftRef} autoFocus size="small" maxLength={120} placeholder={`New ${noun}`} value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                  <Button size="small" type="primary" className="bg-orange-500" loading={busy} onClick={add}>Add</Button>
                </div>
              : <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-orange-600 hover:bg-orange-50" onClick={() => setAdding(true)}>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-xs"><PlusOutlined /></span>Add new {noun}
                </button>}
          </div>
        </>
      )} />
  );
}
