"use client";

import React, { useEffect, useRef, useState } from "react";
import { AutoComplete, Input, Spin } from "antd";
import type { InputRef } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import { usePathname, useRouter } from "next/navigation";
import { announceNavigation } from "@/lib/hooks/useUrlQuery";

interface SearchItem { id: string; title: string; subtitle: string; url: string }
interface SearchGroup { key: string; label: string; items: SearchItem[] }

/** Header search across serials, calls, job cards, customers, dealers and replacements, with grouped suggestions. */
export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<InputRef>(null);
  const requestId = useRef(0);
  const [text, setText] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Ctrl/Cmd + K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced lookup; only the latest request's answer is shown.
  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post("/api/search", { q: term });
        if (id === requestId.current) setGroups(res.data.groups || []);
      } catch {
        if (id === requestId.current) setGroups([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const urlByValue = new Map<string, string>();
  const options = groups.map((group) => ({
    label: <div className="pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{group.label}</div>,
    options: group.items.map((item) => {
      const value = `${group.key}:${item.id}`;
      urlByValue.set(value, item.url);
      return {
        value,
        label: (
          <div className="py-0.5 min-w-0">
            <div className="text-[13px] font-semibold text-slate-800 truncate">{item.title}</div>
            <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
          </div>
        ),
      };
    }),
  }));

  const go = (value: string) => {
    const url = urlByValue.get(value);
    if (!url) return;
    setText("");
    setGroups([]);
    setOpen(false);
    inputRef.current?.blur();
    router.push(url);
    announceNavigation(url);
  };

  const term = text.trim();
  return (
    <AutoComplete
      className="w-full"
      value={text}
      options={options}
      open={open && term.length >= 2}
      onSearch={(v) => { setText(v); setOpen(true); }}
      onSelect={go}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      popupMatchSelectWidth
      defaultActiveFirstOption
      listHeight={420}
      notFoundContent={loading ? <div className="py-3 text-center"><Spin size="small" /></div> : <div className="py-3 text-center text-xs text-slate-500">No matches for “{term}”</div>}
    >
      <Input
        ref={inputRef}
        allowClear
        prefix={<SearchOutlined className="text-slate-400" />}
        suffix={loading && groups.length ? <Spin size="small" /> : <span className="hidden xl:inline text-[10px] font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-400">Ctrl K</span>}
        placeholder="Search serial no, call no, customer, mobile, dealer, job card..."
        className="rounded-xl bg-slate-50 text-xs"
      />
    </AutoComplete>
  );
}
