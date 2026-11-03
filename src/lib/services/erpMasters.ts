import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execute = promisify(execFile);
type ErpResult = { data: { companies: any[]; states: any[]; districts: any[]; productModels: any[]; serviceCenters: any[]; engineers: any[] }; skipped: any[] };
const state = globalThis as typeof globalThis & { erpMasterRequest?: Promise<ErpResult>; erpMasters?: { value: ErpResult; expires: number } };

// The deployed Windows ERP bridge reads SQL Server and maintains local FK identities.
export async function getErpMasters(): Promise<ErpResult> {
  if (state.erpMasters && state.erpMasters.expires > Date.now()) return state.erpMasters.value;
  if (!state.erpMasterRequest) state.erpMasterRequest = (async () => {
    const { stdout } = await execute(process.execPath, [path.join(process.cwd(), "server/import-erp.cjs"), "--apply"], { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024, timeout: 60000, windowsHide: true });
    const value = JSON.parse(stdout) as ErpResult;
    state.erpMasters = { value, expires: Date.now() + 60000 };
    return value;
  })().finally(() => { state.erpMasterRequest = undefined; });
  return state.erpMasterRequest;
}
