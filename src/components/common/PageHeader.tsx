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

export type StatTone = "default" | "warn" | "ok" | "danger";
/** Left-edge colours: tones mean something (ok / warn / danger); plain tiles take the next calm colour in turn. */
const STAT_TONE: Record<Exclude<StatTone, "default">, string> = { ok: "#16a34a", warn: "#f59e0b", danger: "#dc2626" };
const STAT_CALM = ["#2563eb", "#0d9488", "#7c3aed", "#0891b2", "#4f46e5", "#64748b"];
/** Columns per row so a strip of 4, 5 or 7 tiles fills its row instead of leaving a gap. */
const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5", 6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

/**
 * KPI tile row shown above lists and reports, in the Service Dashboard card style:
 * coloured left edge, small caps label, bold figure and an optional one-line hint (`sub`).
 */
export function StatStrip({ items }: { items: { label: string; value: React.ReactNode; tone?: StatTone; sub?: React.ReactNode; accent?: string }[] }) {
  let calm = 0;
  const cols = STAT_COLS[items.length] || "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7";
  return (
    <div className={`grid ${cols} gap-3`}>
      {items.map((item) => {
        const accent = item.accent || (item.tone && item.tone !== "default" ? STAT_TONE[item.tone] : STAT_CALM[calm++ % STAT_CALM.length]);
        return (
          <div key={item.label} className="bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 min-w-0" style={{ borderLeft: `4px solid ${accent}` }}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{item.label}</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{item.value}</div>
            {item.sub != null && <div className="text-xs text-slate-500 mt-2 truncate">{item.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

export const inr = (value: unknown, digits = 0) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const TABLE_CARD = "bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden";
