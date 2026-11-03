import React from "react";

/** Page title row used by list screens: icon + title + subtitle on the left, actions on the right. */
export function PageHeader({ icon, title, subtitle, actions }: { icon: React.ReactNode; title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span className="text-blue-600">{icon}</span>
          {title}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Form label in the house style. */
export const fieldLabel = (text: string) => <span className="text-xs font-semibold text-slate-700">{text}</span>;

/** Small KPI tile row shown above list tables. */
export function StatStrip({ items }: { items: { label: string; value: React.ReactNode; tone?: "default" | "warn" | "ok" | "danger" }[] }) {
  const tones = { default: "text-slate-900", warn: "text-amber-600", ok: "text-emerald-600", danger: "text-red-600" };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
          <div className={`text-lg font-bold mt-0.5 ${tones[item.tone || "default"]}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export const inr = (value: unknown, digits = 0) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const TABLE_CARD = "bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden";
