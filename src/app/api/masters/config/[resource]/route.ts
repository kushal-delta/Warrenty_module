import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/sqlserver";
import { masterConfigs } from "@/lib/config/masters";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { randomUUID } from "crypto";

const resources: Record<string, string> = { spares: "Spares", labour: "LabourMasters", faults: "FaultMasters", "call-types": "CallTypes", projects: "Projects", "service-centers": "ServiceCenters", "approval-rules": "ApprovalRules", states: "States", districts: "Districts" };
const respond = (error: string, status: number) => NextResponse.json({ error }, { status });
function resolved(resource: string) { const config = masterConfigs[resource], table = resources[resource]; return config && table ? { config, table } : null; }
function valuesFor(body: Record<string, unknown>, config: NonNullable<ReturnType<typeof resolved>>["config"]) {
  const values: Record<string, unknown> = {};
  for (const field of config.fields) {
    const value = body[field.name];
    if (field.required && (value === undefined || value === null || String(value).trim() === "")) throw new Error(`${field.label} is required`);
    if (value === undefined) continue;
    if (value === null || value === "") { values[field.name] = null; continue; }
    if (field.kind === "boolean") values[field.name] = Boolean(value);
    else if (field.kind === "number" || field.kind === "money") { const number = Number(value); if (!Number.isFinite(number) || number < 0 || (field.kind === "number" && !Number.isInteger(number))) throw new Error(`${field.label} is invalid`); values[field.name] = field.kind === "money" ? number.toFixed(2) : number; }
    else if (field.kind === "date") { const date = new Date(String(value)); if (Number.isNaN(date.getTime())) throw new Error(`${field.label} is invalid`); values[field.name] = date; }
    else { const text = String(value).trim(); if (field.max && text.length > field.max) throw new Error(`${field.label} exceeds ${field.max} characters`); values[field.name] = text; }
  }
  return values;
}
function databaseError(error: any) { if (["2627", "2601"].includes(String(error?.number))) return respond("A record with this code, name, or level already exists.", 409); if (String(error?.number) === "547") return respond("This record is linked to other data. Remove or reassign those links first.", 409); console.error("Configuration save failed", error); return respond("Unable to save your changes. Please try again.", 500); }
function inputError(error: any) { return error?.message?.match(/required|invalid|exceeds/) ? respond(error.message, 400) : databaseError(error); }

export async function GET(request: NextRequest, { params }: { params: { resource: string } }) { const item = resolved(params.resource); if (!item) return respond("Unknown configuration resource", 404); if (!await sessionFromRequest(request)) return respond("Unauthorized", 401); try { return NextResponse.json({ rows: await query(`SELECT * FROM dbo.[${item.table}] ORDER BY [${item.config.display}] ASC`) }); } catch (error) { return databaseError(error); } }
export async function POST(request: NextRequest, { params }: { params: { resource: string } }) {
  const item = resolved(params.resource); if (!item) return respond("Unknown configuration resource", 404); const user = await sessionFromRequest(request); if (!user) return respond("Unauthorized", 401);
  try { const values = valuesFor(await request.json(), item.config), keys = [item.config.id, ...Object.keys(values), "InsertedByUserId", "LastUpdatedByUserId"]; const row = (await query<any>(`INSERT INTO dbo.[${item.table}] (${keys.map((key) => `[${key}]`).join(", ")}, [InsertedOn], [LastUpdatedOn]) OUTPUT INSERTED.* VALUES (${keys.map((_, index) => `@p${index}`).join(", ")}, SYSUTCDATETIME(), SYSUTCDATETIME())`, [randomUUID(), ...Object.values(values), user.UserId, user.UserId]))[0]; if (params.resource === "spares") await query(`INSERT INTO dbo.[SpareRateHistoryLns] ([SpareRateHistoryLnId], [SpareId], [Rate], [EffectiveFrom], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn]) VALUES (@p0, @p1, @p2, SYSUTCDATETIME(), @p3, @p3, SYSUTCDATETIME(), SYSUTCDATETIME())`, [randomUUID(), row.SpareId, row.CurrentRate, user.UserId]); return NextResponse.json({ row }, { status: 201 }); } catch (error) { return inputError(error); }
}
export async function PUT(request: NextRequest, { params }: { params: { resource: string } }) {
  const item = resolved(params.resource); if (!item) return respond("Unknown configuration resource", 404); const user = await sessionFromRequest(request); if (!user) return respond("Unauthorized", 401);
  try { const body = await request.json(), id = body[item.config.id]; if (typeof id !== "string") return respond("Record ID is required", 400); const values = valuesFor(body, item.config), keys = Object.keys(values); const row = (await query<any>(`UPDATE dbo.[${item.table}] SET ${keys.map((key, index) => `[${key}] = @p${index}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p${keys.length} OUTPUT INSERTED.* WHERE [${item.config.id}] = @p${keys.length + 1}`, [...Object.values(values), user.UserId, id]))[0]; return row ? NextResponse.json({ row }) : respond("Record not found", 404); } catch (error) { return inputError(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: { resource: string } }) { const item = resolved(params.resource); if (!item) return respond("Unknown configuration resource", 404); if (!await sessionFromRequest(request)) return respond("Unauthorized", 401); const id = request.nextUrl.searchParams.get("id"); if (!id) return respond("Record ID is required", 400); try { const rows = await query(`DELETE FROM dbo.[${item.table}] OUTPUT DELETED.[${item.config.id}] WHERE [${item.config.id}] = @p0`, [id]); return rows.length ? NextResponse.json({ success: true }) : respond("Record not found", 404); } catch (error) { return databaseError(error); } }
