"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import indiaMap from "@svg-maps/india";

/**
 * Choropleth map of India's states and union territories (shapes from @svg-maps/india, CC BY 4.0).
 * The page decides the colour of every state (`fillFor`) and what the hover card says (`renderTooltip`);
 * the map draws the shapes with a 1px surface gap, highlights the hovered / selected state,
 * labels the states that have data and are large enough to hold a label, and is keyboard accessible.
 */
type Location = { id: string; name: string; path: string };
const MAP = indiaMap as unknown as { viewBox: string; locations: Location[] };
export const MAP_STATES: { id: string; name: string }[] = MAP.locations.map((l) => ({ id: l.id, name: l.name }));

/** GST state code (dbo.States.StateCode) → map shape. Ladakh (38) sits inside the J&K shape; 26 is the merged DNH & DD UT. */
const CODE_TO_SHAPE: Record<string, string[]> = {
  "01": ["jk"], "02": ["hp"], "03": ["pb"], "04": ["ch"], "05": ["ut"], "06": ["hr"], "07": ["dl"], "08": ["rj"], "09": ["up"], "10": ["br"],
  "11": ["sk"], "12": ["ar"], "13": ["nl"], "14": ["mn"], "15": ["mz"], "16": ["tr"], "17": ["ml"], "18": ["as"], "19": ["wb"], "20": ["jh"],
  "21": ["or"], "22": ["ct"], "23": ["mp"], "24": ["gj"], "25": ["dd"], "26": ["dn", "dd"], "27": ["mh"], "29": ["ka"], "30": ["ga"], "31": ["ld"],
  "32": ["kl"], "33": ["tn"], "34": ["py"], "35": ["an"], "36": ["tg"], "37": ["ap"], "38": ["jk"],
};
/** Map shapes for a state of the master, or [] when it is not an Indian state on the map (e.g. a foreign customer location). */
export const shapesForStateCode = (code?: string | null) => CODE_TO_SHAPE[String(code || "").trim().padStart(2, "0")] || [];

export function IndiaMap({ fillFor, textFor, labelFor, selected, onSelect, renderTooltip, height = 540 }: {
  /** Fill colour of a state (no-data states get the neutral track colour). */
  fillFor: (id: string) => string;
  /** Label ink for a state (light text on dark fills). */
  textFor: (id: string) => string;
  /** Short label drawn on the state ("UP · 11"), or null for none. */
  labelFor: (id: string) => string | null;
  selected?: string[];
  onSelect: (id: string) => void;
  renderTooltip: (id: string, name: string) => React.ReactNode;
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const paths = useRef<Record<string, SVGPathElement | null>>({});
  const [centers, setCenters] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  // Label anchors: the centre of each shape's bounding box (measured once).
  useLayoutEffect(() => {
    const c: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const l of MAP.locations) {
      const el = paths.current[l.id];
      if (!el) continue;
      const b = el.getBBox();
      c[l.id] = { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    }
    // Shapes whose box centre falls outside the land mass get a nudge toward their bulk.
    if (c.wb) c.wb.y += 18;
    if (c.gj) c.gj.x += 10;
    if (c.ka) c.ka.x -= 6;
    if (c.ap) { c.ap.x += 12; c.ap.y -= 8; }
    if (c.as) c.as.x -= 10;
    setCenters(c);
  }, []);

  const isSelected = (id: string) => !!selected?.includes(id);
  // Hovered and selected shapes are drawn last so their outline is never hidden under a neighbour.
  const ordered = useMemo(() => {
    const rank = (id: string) => (hover?.id === id ? 2 : isSelected(id) ? 1 : 0);
    return [...MAP.locations].sort((a, b) => rank(a.id) - rank(b.id));
  }, [hover?.id, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (e: React.MouseEvent, id: string) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hovered = hover ? MAP.locations.find((l) => l.id === hover.id) : null;
  const width = wrap.current?.clientWidth || 0;

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={MAP.viewBox} className="w-full h-full" role="img" aria-label="Map of India by state">
        <defs>
          <filter id="india-map-lift" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.25" />
          </filter>
        </defs>
        {ordered.map((l) => {
          const on = isSelected(l.id), over = hover?.id === l.id;
          return (
            <path key={l.id} ref={(el) => { paths.current[l.id] = el; }} d={l.path}
              fill={fillFor(l.id)} stroke={on ? "#0f172a" : over ? "#334155" : "#ffffff"} strokeWidth={on ? 2 : over ? 1.5 : 0.8} strokeLinejoin="round"
              filter={on || over ? "url(#india-map-lift)" : undefined}
              className="cursor-pointer outline-none transition-[fill] duration-300 focus-visible:stroke-blue-600"
              tabIndex={0} role="button" aria-label={l.name} aria-pressed={on}
              onMouseMove={(e) => move(e, l.id)} onClick={() => onSelect(l.id)}
              onFocus={() => {
                // Keyboard: anchor the card on the shape (the SVG is scaled to fit and centred — "meet").
                const c = centers[l.id], w = wrap.current;
                if (!c || !w) return;
                const s = Math.min(w.clientWidth / 612, height / 696), ox = (w.clientWidth - 612 * s) / 2, oy = (height - 696 * s) / 2;
                setHover({ id: l.id, x: ox + c.x * s, y: oy + c.y * s });
              }}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(l.id); } }} />
          );
        })}
        {/* Direct labels only where the shape has data and room for them */}
        {MAP.locations.map((l) => {
          const label = labelFor(l.id), c = centers[l.id];
          if (!label || !c || c.w < 26 || c.h < 16) return null;
          return (
            <text key={`t-${l.id}`} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
              fontSize={c.w > 70 ? 13 : 10} fontWeight={700} fill={textFor(l.id)}
              style={{ paintOrder: "stroke", stroke: textFor(l.id) === "#ffffff" ? "rgba(15,23,42,.35)" : "rgba(255,255,255,.85)", strokeWidth: 2.5 }}>
              {label}
            </text>
          );
        })}
      </svg>

      {/* Attribution required by the map data licence (CC BY 4.0) */}
      <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer" className="absolute right-1 bottom-0 text-[9.5px] text-slate-300 hover:text-slate-500">Map © svg-maps · CC BY 4.0</a>

      {hover && hovered && (
        <div className="pointer-events-none absolute z-10 min-w-[220px] max-w-[260px] rounded-xl border border-slate-200 bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur-sm"
          style={{ left: Math.min(hover.x + 16, Math.max(0, width - 270)), top: Math.max(0, hover.y - 20) }}>
          {renderTooltip(hovered.id, hovered.name)}
        </div>
      )}
    </div>
  );
}
