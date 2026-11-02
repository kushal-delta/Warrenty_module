import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  Companies,
  States,
  Districts,
  ProductModels,
  Projects,
  CallTypes,
  FaultMasters,
  ServiceCenters,
  Spares,
  LabourMasters,
  ApprovalRules,
} from "@/db/schema";
import { asc } from "drizzle-orm";

/**
 * RULES §8: Minimal API calls — batch bootstrap data into one single round-trip
 */
export async function POST(request: NextRequest) {
  try {
    const [
      companies,
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
    ] = await Promise.all([
      db.select().from(Companies).limit(1),
      db.select().from(States).orderBy(asc(States.StateCode)),
      db.select().from(Districts).orderBy(asc(Districts.DistrictName)),
      db.select().from(ProductModels).orderBy(asc(ProductModels.ModelCode)),
      db.select().from(Projects).orderBy(asc(Projects.ProjectNo)),
      db.select().from(CallTypes).orderBy(asc(CallTypes.CallTypeName)),
      db.select().from(FaultMasters).orderBy(asc(FaultMasters.Category), asc(FaultMasters.FaultName)),
      db.select().from(ServiceCenters).orderBy(asc(ServiceCenters.ServiceCenterCode)),
      db.select().from(Spares).orderBy(asc(Spares.SpareCode)),
      db.select().from(LabourMasters).orderBy(asc(LabourMasters.LabourCode)),
      db.select().from(ApprovalRules).orderBy(asc(ApprovalRules.LevelNo)),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        company: companies[0] || null,
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
      },
    });
  } catch (err: any) {
    console.error("Bootstrap API error:", err);
    return NextResponse.json({ error: "Failed to load master bootstrap data" }, { status: 500 });
  }
}
