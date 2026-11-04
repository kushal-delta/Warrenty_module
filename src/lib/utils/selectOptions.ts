/**
 * Dropdown option helpers.
 *
 * The Districts master is synced from the ERP and repeats names (e.g. "GWALIOR" four times, or
 * "Ajmer" under two states). Ant Design's virtual list needs unique option values — duplicates make
 * rows repeat or jump while scrolling — so district options are de-duplicated by name, ignoring case.
 */
export interface DistrictLike { DistrictName: string; StateId?: string | null }

/** Readable spelling wins over ALL-CAPS when the same district appears in both. */
const better = (a: string, b: string) => (a === a.toUpperCase() && b !== b.toUpperCase() ? b : a);

/** Unique, sorted district options, optionally limited to some states. */
export function districtOptions(districts: DistrictLike[], stateIds?: string | string[] | null) {
  const states = (Array.isArray(stateIds) ? stateIds : stateIds ? [stateIds] : []).map((s) => String(s).toLowerCase());
  const byName = new Map<string, string>();
  for (const d of districts) {
    const name = String(d.DistrictName || "").trim();
    if (!name) continue;
    if (states.length && !states.includes(String(d.StateId || "").toLowerCase())) continue;
    const key = name.toLowerCase();
    const seen = byName.get(key);
    byName.set(key, seen ? better(seen, name) : name);
  }
  return Array.from(byName.values())
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map((name) => ({ value: name, label: name }));
}

/** Drops options whose value repeats (first one wins) — safe guard for any list built from master data. */
export function uniqueOptions<T extends { value: unknown }>(options: T[]): T[] {
  const seen = new Set<string>();
  return options.filter((o) => {
    const key = String(o.value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
