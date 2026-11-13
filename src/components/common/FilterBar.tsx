"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Popover } from "antd";
import { CloseOutlined, FilterOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";

/**
 * Compact filter bar for screens with many filters: a search chip, the main ("pinned") filters,
 * and a "+ More Filters" menu that reveals the rest one by one as labelled chips (each removable with ×).
 * A filter that has a value is always shown, so nothing applied is ever hidden.
 *
 * Put controls inside chips with `variant="borderless"` (Select, DatePicker.RangePicker, Input) — the chip draws the frame.
 */
export interface FilterDef {
  key: string;
  /** Chip label and menu entry, e.g. "Status". */
  label: string;
  /** Section in the More Filters menu, e.g. "Call details". */
  group?: string;
  icon?: React.ReactNode;
  /** Always visible (no × button). */
  pinned?: boolean;
  /** The filter currently has a value. */
  active: boolean;
  /** Clears the value (called by × and Clear all). */
  onClear: () => void;
  /** The control shown in the chip. */
  render: () => React.ReactNode;
}

export function FilterBar({ search, filters, storageKey, extra }: {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; width?: number };
  filters: FilterDef[];
  /** Remembers which extra filters this user opened on this screen (per browser). */
  storageKey?: string;
  /** Anything to show at the right end (e.g. a record count). */
  extra?: React.ReactNode;
}) {
  const storage = storageKey ? `filterbar:${storageKey}` : null;
  const [revealed, setRevealed] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  useEffect(() => {
    if (!storage) return;
    try { const saved = JSON.parse(window.localStorage.getItem(storage) || "[]"); if (Array.isArray(saved)) setRevealed(saved.map(String)); } catch { /* storage unavailable */ }
  }, [storage]);
  const remember = (keys: string[]) => {
    setRevealed(keys);
    if (storage) try { window.localStorage.setItem(storage, JSON.stringify(keys)); } catch { /* storage unavailable */ }
  };

  const visible = filters.filter((f) => f.pinned || f.active || revealed.includes(f.key));
  const hidden = filters.filter((f) => !visible.includes(f));
  const activeCount = filters.filter((f) => f.active).length + (search?.value ? 1 : 0);

  const menuGroups = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    const groups = new Map<string, FilterDef[]>();
    hidden.filter((f) => !q || f.label.toLowerCase().includes(q) || (f.group || "").toLowerCase().includes(q))
      .forEach((f) => { const g = f.group || "More"; groups.set(g, [...(groups.get(g) || []), f]); });
    return Array.from(groups.entries());
  }, [hidden, menuSearch]);

  const reveal = (key: string) => { remember(Array.from(new Set([...revealed, key]))); setMenuOpen(false); setMenuSearch(""); };
  const remove = (f: FilterDef) => { f.onClear(); remember(revealed.filter((k) => k !== f.key)); };
  const clearAll = () => { filters.forEach((f) => f.active && f.onClear()); search?.onChange(""); };

  const menu = (
    <div className="fbar-menu">
      <div className="fbar-menu-title">Reveal extra filters</div>
      <Input size="small" prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search filters…" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} allowClear autoFocus />
      <div className="fbar-menu-list">
        {menuGroups.length ? menuGroups.map(([group, items]) => (
          <div key={group}>
            <div className="fbar-menu-group">{group}</div>
            {items.map((f) => (
              <button key={f.key} type="button" className="fbar-menu-item" onClick={() => reveal(f.key)}>
                <span className="fbar-menu-icon">{f.icon || <FilterOutlined />}</span>{f.label}
              </button>
            ))}
          </div>
        )) : <div className="fbar-menu-empty">{hidden.length ? "No filter matches" : "All filters are shown"}</div>}
      </div>
    </div>
  );

  return (
    <div className="fbar">
      <span className="fbar-title"><FilterOutlined /> Filters</span>
      {search && (
        <div className="fbar-chip fbar-chip-search" style={{ width: search.width }}>
          <span className="fbar-chip-label">Search</span>
          <Input variant="borderless" prefix={<SearchOutlined className="text-slate-400" />} placeholder={search.placeholder || "Search…"} value={search.value} onChange={(e) => search.onChange(e.target.value)} allowClear />
        </div>
      )}
      {visible.map((f) => (
        <div key={f.key} className={`fbar-chip${f.active ? " fbar-chip-on" : ""}`}>
          <span className="fbar-chip-label">{f.label}</span>
          <div className="fbar-chip-control">{f.render()}</div>
          {!f.pinned && <button type="button" className="fbar-chip-x" aria-label={`Remove ${f.label} filter`} onClick={() => remove(f)}><CloseOutlined /></button>}
        </div>
      ))}
      {hidden.length > 0 && (
        <Popover content={menu} trigger="click" placement="bottomLeft" open={menuOpen} onOpenChange={(o) => { setMenuOpen(o); if (!o) setMenuSearch(""); }} arrow={false}>
          <Button type="dashed" icon={<PlusOutlined />} className="fbar-more">More Filters</Button>
        </Popover>
      )}
      {activeCount > 0 && <Button type="link" size="small" onClick={clearAll} className="fbar-clear">Clear all ({activeCount})</Button>}
      {extra && <span className="fbar-extra">{extra}</span>}
    </div>
  );
}
