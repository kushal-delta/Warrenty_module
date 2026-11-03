"use client";

import React from "react";
import { Button, Checkbox } from "antd";
import { ALL_FORMS, FORM_GROUPS, defaultFormsForRole } from "@/lib/auth/forms";

/**
 * Screen rights checklist, shown for every role. Value is the list of ticked form keys;
 * the user can open only these screens (plus the dashboard). Admin / Super Admin accounts always see everything.
 */
export function FormRightsPicker({ value, onChange, role, unrestricted }: {
  value?: string[];
  onChange?: (value: string[]) => void;
  role?: string;
  unrestricted?: boolean;
}) {
  const selected = new Set(value || []);
  // Expand module keys saved by older versions (e.g. "Service") into their screens.
  FORM_GROUPS.forEach((g) => { if (selected.has(g.key)) { selected.delete(g.key); g.forms.forEach((f) => selected.add(f.key)); } });
  const emit = (next: Set<string>) => onChange?.(Array.from(next));
  const isTicked = (key: string) => unrestricted || selected.has(key);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          {unrestricted ? "Administrator / Super Admin — every screen is visible." : `${ALL_FORMS.filter((f) => selected.has(f.key)).length} of ${ALL_FORMS.length} screens visible to this user`}
        </span>
        {!unrestricted && (
          <div className="flex gap-1.5">
            <Button size="small" onClick={() => emit(new Set(ALL_FORMS.map((f) => f.key)))}>Select all</Button>
            {role && <Button size="small" onClick={() => emit(new Set(defaultFormsForRole(role)))}>Suggested for {role}</Button>}
            <Button size="small" onClick={() => emit(new Set())}>Clear</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FORM_GROUPS.map((group) => {
          const ticked = group.forms.filter((f) => isTicked(f.key)).length;
          return (
            <div key={group.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <Checkbox
                disabled={unrestricted}
                checked={ticked === group.forms.length}
                indeterminate={ticked > 0 && ticked < group.forms.length}
                onChange={(e) => { const next = new Set(selected); group.forms.forEach((f) => (e.target.checked ? next.add(f.key) : next.delete(f.key))); emit(next); }}
                className="font-semibold text-slate-800"
              >
                {group.label}
              </Checkbox>
              <div className="mt-2 ml-6 flex flex-col gap-1.5">
                {group.forms.map((form) => (
                  <Checkbox key={form.key} disabled={unrestricted} checked={isTicked(form.key)} className="text-[13px]"
                    onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(form.key); else next.delete(form.key); emit(next); }}>
                    {form.label}
                  </Checkbox>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
