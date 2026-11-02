import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  Complaints,
  CallTypes,
  ServiceCenters,
  Users,
  Projects,
  Customers,
} from "@/db/schema";
import { desc, eq, and, ilike } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { status, serviceCenterId, engineerUserId, search, limit = 100 } = body;

    const rows = await db
      .select({
        ComplaintId: Complaints.ComplaintId,
        ComplaintNo: Complaints.ComplaintNo,
        CallDate: Complaints.CallDate,
        CallTypeId: Complaints.CallTypeId,
        CallTypeName: CallTypes.CallTypeName,
        ProjectId: Complaints.ProjectId,
        ProjectName: Projects.ProjectName,
        Priority: Complaints.Priority,
        Source: Complaints.Source,
        Status: Complaints.Status,
        InstallationId: Complaints.InstallationId,
        CustomerId: Complaints.CustomerId,
        CustomerName: Complaints.CustomerName,
        Mobile: Complaints.Mobile,
        Address: Complaints.Address,
        Village: Complaints.Village,
        District: Complaints.District,
        StateId: Complaints.StateId,
        Pincode: Complaints.Pincode,
        WarrantyStatus: Complaints.WarrantyStatus,
        ComplaintText: Complaints.ComplaintText,
        ServiceCenterId: Complaints.ServiceCenterId,
        ServiceCenterName: ServiceCenters.ServiceCenterName,
        EngineerUserId: Complaints.EngineerUserId,
        EngineerFirstName: Users.FirstName,
        EngineerLastName: Users.LastName,
        AssignedOn: Complaints.AssignedOn,
        DueDate: Complaints.DueDate,
        ClosedOn: Complaints.ClosedOn,
        Resolution: Complaints.Resolution,
        CreatedBy: Complaints.CreatedBy,
        InsertedOn: Complaints.InsertedOn,
        LastUpdatedOn: Complaints.LastUpdatedOn,
      })
      .from(Complaints)
      .leftJoin(CallTypes, eq(Complaints.CallTypeId, CallTypes.CallTypeId))
      .leftJoin(ServiceCenters, eq(Complaints.ServiceCenterId, ServiceCenters.ServiceCenterId))
      .leftJoin(Users, eq(Complaints.EngineerUserId, Users.UserId))
      .leftJoin(Projects, eq(Complaints.ProjectId, Projects.ProjectId))
      .orderBy(desc(Complaints.InsertedOn))
      .limit(limit);

    const enriched = rows.map((c) => ({
      ...c,
      EngineerName: c.EngineerFirstName
        ? `${c.EngineerFirstName} ${c.EngineerLastName || ""}`.trim()
        : "Unassigned",
    }));

    let filtered = enriched;
    if (status) {
      filtered = filtered.filter((c) => c.Status === status);
    }
    if (serviceCenterId) {
      filtered = filtered.filter((c) => c.ServiceCenterId === serviceCenterId);
    }
    if (engineerUserId) {
      filtered = filtered.filter((c) => c.EngineerUserId === engineerUserId);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.ComplaintNo.toLowerCase().includes(q) ||
          c.CustomerName.toLowerCase().includes(q) ||
          c.Mobile.includes(q) ||
          (c.Village && c.Village.toLowerCase().includes(q)) ||
          (c.District && c.District.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, complaints: filtered });
  } catch (err: any) {
    console.error("Complaints get error:", err);
    return NextResponse.json({ error: "Failed to fetch complaints" }, { status: 500 });
  }
}
