import { sessionFromRequest } from "@/lib/auth/jwt";
import { query } from "@/lib/sqlserver";
import { getErpCompany } from "@/lib/services/erpCompany";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Loads every dropdown master from the operational SQL Server and ERP company in one request. */
export async function POST(request: NextRequest) {
  try {
    if (!await sessionFromRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [company, states, districts, productModels, projects, callTypes, faultMasters, serviceCenters, spares, labourMasters, approvalRules, engineers] = await Promise.all([
      getErpCompany().catch((err) => {
        console.warn("iERP company fetch in bootstrap skipped:", err.message);
        return null;
      }),
      query(`SELECT * FROM dbo.[States] ORDER BY [StateCode]`),
      query(`SELECT * FROM dbo.[Districts] ORDER BY [DistrictName]`),
      query(`SELECT * FROM dbo.[ProductModels] ORDER BY [ModelCode]`),
      query(`SELECT * FROM dbo.[Projects] ORDER BY [ProjectNo]`),
      query(`SELECT * FROM dbo.[CallTypes] ORDER BY [CallTypeName]`),
      query(`SELECT * FROM dbo.[FaultMasters] ORDER BY [Category], [FaultName]`),
      query(`SELECT * FROM dbo.[ServiceCenters] ORDER BY [ServiceCenterCode]`),
      query(`SELECT * FROM dbo.[Spares] ORDER BY [SpareCode]`),
      query(`SELECT * FROM dbo.[LabourMasters] ORDER BY [LabourCode]`),
      query(`SELECT * FROM dbo.[ApprovalRules] ORDER BY [LevelNo]`),
      query(`SELECT [UserId], [Username], [FirstName], [LastName], [Phone], [Email], [ServiceCenterId] FROM dbo.[Users] WHERE [Role] = 'ENGINEER' AND [IsActive] = 1 ORDER BY [FirstName]`)
    ]);
    return NextResponse.json({
      success: true,
      data: {
        company: company || null,
        states,
        districts,
        productModels,
        projects,
        callTypes,
        faultMasters,
        serviceCenters,
        spares,
        labourMasters,
        approvalRules,
        engineers,
        sourceWarnings: []
      }
    });
  } catch (err: any) {
    console.error("Bootstrap API error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load master bootstrap data" }, { status: 500 });
  }
}
