import type { Run } from "@/lib/services/apiHelpers";
import type { DataScope } from "@/lib/auth/scope";
import { serialWarranty, type SerialWarranty } from "@/lib/services/complaints";
import { warrantyFilter, positionalParams } from "@/lib/auth/scope";

/**
 * "Replacement Flow (In Warranty)": a faulty unit that is still in warranty is swapped for a new sticker of the same
 * component type and its balance warranty moves to the new serial. These checks are shown live on the form
 * and re-run on submit, so the screen and the API can never disagree.
 */
export interface Verdict { ok: boolean; message: string; info?: Partial<SerialWarranty> & { Hp?: string | null; Customer?: string | null } }

const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "—");
const cat = (c?: string | null) => (c ? c.charAt(0) + c.slice(1).toLowerCase() : "");

async function hpOf(run: Run, modelId?: string | null) {
  if (!modelId) return null;
  const row = (await run<any>(`SELECT [Hp] FROM dbo.[ProductModels] WHERE [ProductModelId] = @id`, { id: modelId }))[0];
  return row?.Hp != null ? String(Number(row.Hp)) : null;
}

export async function checkOld(run: Run, scope: DataScope, serialNo: string): Promise<{ verdict: Verdict | null; warranty?: SerialWarranty }> {
  const sn = serialNo.trim().toUpperCase();
  if (!sn) return { verdict: null };
  const w = await serialWarranty(run, sn);
  if (w.State === "unk") return { verdict: { ok: false, message: "Not authenticated — serial not in the sticker register" } };
  if (w.State === "unreg") return { verdict: { ok: false, message: "This product is not registered, so it has no warranty to replace. Register it first." } };
  if (w.State === "out") {
    return { verdict: { ok: false, message: w.Label === "Replaced" ? "Already replaced earlier" : `Warranty expired on ${day(w.EndDate)} — cannot be replaced in warranty` } };
  }
  if (scope.portal === "DEALER" && String(w.DealerId || "").toLowerCase() !== String(scope.dealerId || "").toLowerCase()) {
    return { verdict: { ok: false, message: "This unit was sold by another dealer — you can only replace your own sales" } };
  }
  // State / district rights of staff users.
  const params: unknown[] = [w.WarrantyId];
  const filter = warrantyFilter(scope, "w", positionalParams(params));
  if (filter && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[Warranties] w WHERE w.[WarrantyId] = @p0 AND ${filter}`, Object.fromEntries(params.map((v, i) => [`p${i}`, v])))).length) {
    return { verdict: { ok: false, message: "This unit is outside your state / district rights" } };
  }
  return {
    warranty: w,
    verdict: {
      ok: true,
      message: `In warranty · ${cat(w.Category)} · ${w.ModelName || "—"} · ${w.CustomerName || "—"} · ${w.DaysLeft} days balance (till ${day(w.EndDate)})`,
      info: { ...w, Hp: await hpOf(run, w.ProductModelId), Customer: w.CustomerName },
    },
  };
}

export async function checkNew(run: Run, serialNo: string, oldSerial: string, old?: SerialWarranty): Promise<Verdict | null> {
  const sn = serialNo.trim().toUpperCase();
  if (!sn) return null;
  if (sn === oldSerial.trim().toUpperCase()) return { ok: false, message: "Old and new serial numbers are the same" };
  const w = await serialWarranty(run, sn);
  if (w.State === "unk") return { ok: false, message: "Not authenticated — serial not in the sticker register" };
  if (w.State !== "unreg" || ["Registered", "Replaced"].includes(w.StickerStatus || "")) return { ok: false, message: "This serial is already registered to a customer" };
  if (old && w.Category !== old.Category) return { ok: false, message: `This is a ${cat(w.Category).toLowerCase()} — the faulty unit is a ${cat(old.Category).toLowerCase()}` };
  const [newHp, oldHp] = await Promise.all([hpOf(run, w.ProductModelId), old ? hpOf(run, old.ProductModelId) : Promise.resolve(null)]);
  const warn = oldHp && newHp && oldHp !== newHp ? ` ⚠ Rating differs: ${oldHp} HP → ${newHp} HP` : "";
  return { ok: true, message: `Authentic · ${cat(w.Category)} · ${w.ModelName || "—"} · available for registration${warn}`, info: { ...w, Hp: newHp } };
}
