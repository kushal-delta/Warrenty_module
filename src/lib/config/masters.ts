export type Field = { name: string; label: string; kind?: "number" | "money" | "percent" | "boolean" | "state" | "user" | "center" | "date" | "text"; required?: boolean; max?: number };
export type MasterConfig = { title: string; description: string; id: string; display: string; fields: Field[] };
export const masterConfigs: Record<string, MasterConfig> = {
  spares: { title: "Spares & Rates", description: "Manage spare parts, current rates, and minimum stock levels.", id: "SpareId", display: "SpareName", fields: [
    { name: "SpareCode", label: "Spare Code", required: true, max: 40 }, { name: "SpareName", label: "Spare Name", required: true, max: 150 }, { name: "Category", label: "Category", max: 20 }, { name: "Uom", label: "Unit", required: true, max: 20 }, { name: "CurrentRate", label: "Current Rate", kind: "money", required: true }, { name: "GstPct", label: "GST %", kind: "percent", required: true }, { name: "MinStock", label: "Minimum Stock", kind: "number", required: true }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  labour: { title: "Labour / Service Charges", description: "Maintain standard charges for service work.", id: "LabourMasterId", display: "LabourName", fields: [
    { name: "LabourCode", label: "Labour Code", required: true, max: 40 }, { name: "LabourName", label: "Service Name", required: true, max: 150 }, { name: "StandardRate", label: "Standard Rate", kind: "money", required: true }, { name: "GstPct", label: "GST %", kind: "percent", required: true }, { name: "SkillLevel", label: "Skill Level", max: 40 }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  faults: { title: "Fault Master", description: "Define faults used by job cards and service teams.", id: "FaultMasterId", display: "FaultName", fields: [
    { name: "Category", label: "Category", required: true, max: 20 }, { name: "FaultName", label: "Fault Name", required: true, max: 120 }, { name: "DefaultNature", label: "Default Nature", kind: "text", max: 300 }, { name: "SortOrder", label: "Sort Order", kind: "number", required: true }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  "call-types": { title: "Call Types & Valid Days", description: "Set call classifications and service validity periods.", id: "CallTypeId", display: "CallTypeName", fields: [
    { name: "CallTypeName", label: "Call Type", required: true, max: 80 }, { name: "ValidDays", label: "Valid Days", kind: "number", required: true }, { name: "IsWarranty", label: "Warranty Call", kind: "boolean" }, { name: "Description", label: "Description", kind: "text", max: 300 }, { name: "SortOrder", label: "Sort Order", kind: "number", required: true }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  projects: { title: "Projects / Schemes", description: "Manage schemes linked to installations and service calls.", id: "ProjectId", display: "ProjectName", fields: [
    { name: "ProjectNo", label: "Project Number", required: true, max: 40 }, { name: "ProjectName", label: "Project Name", required: true, max: 150 }, { name: "Scheme", label: "Scheme", max: 80 }, { name: "StateId", label: "State", kind: "state" }, { name: "StartDate", label: "Start Date", kind: "date" }, { name: "EndDate", label: "End Date", kind: "date" }, { name: "Status", label: "Status", required: true, max: 30 }, { name: "Remarks", label: "Remarks", kind: "text", max: 300 },
  ] },
  "service-centers": { title: "Service Centers", description: "Maintain service locations and contact details.", id: "ServiceCenterId", display: "ServiceCenterName", fields: [
    { name: "ServiceCenterCode", label: "Center Code", max: 30 }, { name: "ServiceCenterName", label: "Center Name", required: true, max: 150 }, { name: "ContactPerson", label: "Contact Person", max: 100 }, { name: "Mobile", label: "Mobile", max: 20 }, { name: "Email", label: "Email", max: 120 }, { name: "Address", label: "Address", kind: "text", max: 300 }, { name: "City", label: "City", max: 80 }, { name: "District", label: "District", max: 80 }, { name: "StateId", label: "State", kind: "state" }, { name: "Pincode", label: "Pincode", max: 12 }, { name: "Gstin", label: "GSTIN", max: 30 }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  "approval-rules": { title: "Approval Rules", description: "Configure job card approval levels and amount limits.", id: "ApprovalRuleId", display: "RoleName", fields: [
    { name: "LevelNo", label: "Level", kind: "number", required: true }, { name: "RoleName", label: "Approver Role", required: true, max: 50 }, { name: "ApproverUserId", label: "Approver", kind: "user" }, { name: "MinAmount", label: "Minimum Amount", kind: "money", required: true }, { name: "MaxAmount", label: "Maximum Amount", kind: "money" }, { name: "Description", label: "Description", kind: "text", max: 250 }, { name: "IsActive", label: "Active", kind: "boolean" },
  ] },
  states: { title: "States", description: "Manage state codes used across the system.", id: "StateId", display: "StateName", fields: [
    { name: "StateCode", label: "State Code", required: true, max: 10 }, { name: "StateName", label: "State Name", required: true, max: 80 }, { name: "ShortName", label: "Short Name", max: 10 }, { name: "SortOrder", label: "Sort Order", kind: "number", required: true },
  ] },
  districts: { title: "Districts", description: "Manage districts and their parent states.", id: "DistrictId", display: "DistrictName", fields: [
    { name: "StateId", label: "State", kind: "state", required: true }, { name: "DistrictName", label: "District Name", required: true, max: 80 }, { name: "SortOrder", label: "Sort Order", kind: "number", required: true },
  ] },
};
