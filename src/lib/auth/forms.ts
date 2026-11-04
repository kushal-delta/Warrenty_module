/**
 * Form (screen) rights — single source of truth for the sidebar, page guard, API guard and the User Management form.
 * Pure TypeScript with no Node imports, so it also runs in the Edge middleware.
 *
 * A user can open a form when:
 *   1. they are unrestricted (IsAdmin or SUPER), or
 *   2. their FormRights lists the form key (e.g. "service.jobcards") or its module key (e.g. "Service").
 * Only the ticked screens are visible — a user with no screens ticked sees just the dashboard.
 * `roles` is only the suggested starting selection when an admin picks a role for a user
 * (Dealer / Customer suggestions follow the prototype's dealer and customer portal menus).
 */
export type RoleCode = "SUPER" | "HO" | "MANAGER" | "ENGINEER" | "SERVICE_CENTER" | "DEALER" | "CUSTOMER";

const ALL_STAFF: RoleCode[] = ["SUPER", "HO", "MANAGER", "ENGINEER"];
const STAFF: RoleCode[] = ["SUPER", "HO", "MANAGER"];
const HO: RoleCode[] = ["SUPER", "HO"];
const DEALER: RoleCode[] = ["DEALER"];
const CUSTOMER: RoleCode[] = ["CUSTOMER"];
const CENTER: RoleCode[] = ["SERVICE_CENTER"];

export interface FormDef { key: string; label: string; path: string; roles: RoleCode[]; /** Menu wording for portal / engineer roles (prototype dealer, customer and engineer menus). */ labels?: Partial<Record<RoleCode, string>> }
export interface FormGroup { key: string; label: string; forms: FormDef[] }

export const FORM_GROUPS: FormGroup[] = [
  {
    key: "Warranty", label: "Warranty System", forms: [
      { key: "warranty.serials", label: "Serial Register", path: "/warranty/stickers", roles: HO },
      { key: "warranty.register", label: "Register Installation", path: "/warranty/register", roles: [...HO, ...DEALER, ...CUSTOMER], labels: { DEALER: "Register Warranty", CUSTOMER: "Register Product (Scan QR)" } },
      { key: "warranty.active", label: "Active Warranties", path: "/warranty/active", roles: [...STAFF, ...DEALER, ...CUSTOMER], labels: { DEALER: "Active Warranty List", CUSTOMER: "My Warranty" } },
      { key: "warranty.replace", label: "Replacement Flow (In Warranty)", path: "/warranty/replace", roles: [...HO, ...DEALER], labels: { DEALER: "Replacement Flow (In Warranty)" } },
      { key: "warranty.search", label: "Serial No. Search Report", path: "/warranty/search", roles: [...ALL_STAFF, ...DEALER, ...CUSTOMER] },
      { key: "warranty.verify", label: "Serial Verification", path: "/warranty/verify", roles: [...ALL_STAFF, ...CENTER, ...DEALER, ...CUSTOMER], labels: { DEALER: "Serial No. Search Report", CUSTOMER: "Serial No. Search Report" } },
      { key: "warranty.dealers", label: "Dealers Master", path: "/warranty/dealers", roles: HO },
      { key: "warranty.customers", label: "Customers", path: "/warranty/customers", roles: [...STAFF, ...DEALER] },
      { key: "warranty.geo", label: "Geo-Graphical Report", path: "/warranty/geo", roles: HO },
    ],
  },
  {
    key: "Service", label: "Service Management", forms: [
      { key: "service.dashboard", label: "Service Dashboard", path: "/service", roles: ALL_STAFF },
      { key: "service.dashboard", label: "Service Dashboard", path: "/service/dashboard", roles: STAFF },
      { key: "service.complaints", label: "Complaints Register", path: "/service/complaints", roles: [...ALL_STAFF, ...CENTER, ...DEALER, ...CUSTOMER], labels: { DEALER: "Book / Track Service Calls", CUSTOMER: "My Service Calls", ENGINEER: "Service Calls", SERVICE_CENTER: "Service Calls" } },
      { key: "service.reminders", label: "Call Reminders", path: "/service/reminders", roles: STAFF },
      { key: "service.visits", label: "Visit Reports", path: "/service/visits", roles: ALL_STAFF },
      { key: "service.jobcards", label: "Job Cards (Estimate)", path: "/service/jobcards", roles: [...ALL_STAFF, ...CENTER] },
      { key: "service.approvals", label: "Job Card Approvals", path: "/service/approvals", roles: STAFF },
      { key: "service.replacements", label: "Replacement / Return", path: "/service/replacements", roles: [...STAFF, ...DEALER], labels: { DEALER: "Replacement Flow (In Warranty)" } },
      { key: "service.reports", label: "Service Reports", path: "/service/reports", roles: STAFF },
    ],
  },
  {
    key: "Stock", label: "Spares Stock", forms: [
      { key: "stock.availability", label: "Stock Availability", path: "/stock/availability", roles: ALL_STAFF, labels: { ENGINEER: "My Stock" } },
      { key: "stock.engineer", label: "Engineer-wise Stock", path: "/stock/engineer", roles: STAFF },
      { key: "stock.ledger", label: "Stock Ledger & Entry", path: "/stock/ledger", roles: STAFF },
      { key: "stock.consumption", label: "Parts Consumption", path: "/stock/consumption", roles: STAFF },
      { key: "stock.requests", label: "Material Request", path: "/stock/material-requests", roles: [...STAFF, ...CENTER] },
      { key: "stock.request-approvals", label: "Material Approvals", path: "/stock/material-approvals", roles: HO },
      { key: "stock.challans", label: "Delivery Challan", path: "/stock/challans", roles: HO },
    ],
  },
  {
    key: "Masters", label: "Configuration", forms: [
      { key: "masters.company", label: "Company Profile", path: "/masters/company", roles: HO },
      { key: "masters.users", label: "User Management", path: "/admin/users", roles: HO },
      { key: "masters.service-centers", label: "Service Centers", path: "/masters/service-centers", roles: HO },
      { key: "masters.service-engineers", label: "Service Engineers", path: "/masters/service-engineers", roles: HO },
      { key: "masters.spares", label: "Spares & Rates", path: "/masters/config/spares", roles: HO },
      { key: "masters.labour", label: "Labour / Service Charges", path: "/masters/config/labour", roles: HO },
      { key: "masters.faults", label: "Fault Master", path: "/masters/config/faults", roles: HO },
      { key: "masters.call-types", label: "Call Types & Valid Days", path: "/masters/config/call-types", roles: HO },
      { key: "masters.projects", label: "Projects / Schemes", path: "/masters/config/projects", roles: HO },
      { key: "masters.approval-rules", label: "Approval Rules", path: "/masters/config/approval-rules", roles: HO },
      { key: "masters.text-lists", label: "Text Lists", path: "/masters/text-lists", roles: HO },
      { key: "system.activity", label: "Activity & Message Log", path: "/system/activity", roles: STAFF },
    ],
  },
];

export const ALL_FORMS: FormDef[] = FORM_GROUPS.flatMap((g) => g.forms);
const FORM_BY_KEY = new Map(ALL_FORMS.map((f) => [f.key, f]));
const GROUP_OF = new Map(FORM_GROUPS.flatMap((g) => g.forms.map((f) => [f.key, g.key] as const)));

export interface AccessUser { Role: string; IsAdmin?: boolean | null; FormRights?: string | null }

export const parseList = (value?: string | null) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);

/** Normalises rights sent by a form (array or comma string) to the stored comma string; empty = null (states/districts: all; screens: none). */
export function rightsString(value: unknown, allowed?: (item: string) => boolean): string | null {
  const items = (Array.isArray(value) ? value.map(String) : parseList(value as string | null)).map((x) => x.trim()).filter(Boolean);
  const unique = Array.from(new Set(items)).filter((x) => !allowed || allowed(x));
  return unique.length ? unique.join(",") : null;
}

/** Valid FormRights entries: a form key or a module key. */
export const isFormRight = (item: string) => FORM_GROUPS.some((g) => g.key === item || g.forms.some((f) => f.key === item));
export const isUnrestricted = (u: AccessUser) => Boolean(u.IsAdmin) || u.Role === "SUPER";

export function canUseForm(user: AccessUser | null | undefined, formKey: string) {
  const form = FORM_BY_KEY.get(formKey);
  if (!user || !form) return false;
  if (isUnrestricted(user)) return true;
  const rights = parseList(user.FormRights);
  return rights.includes(formKey) || rights.includes(GROUP_OF.get(formKey) || "");
}

/** Prototype engineer login: Serial No. Search · Service Calls · Visit Reports · Job Cards (Estimate) · My Stock. */
const SUGGESTED: Partial<Record<RoleCode, string[]>> = {
  ENGINEER: ["warranty.search", "service.complaints", "service.visits", "service.jobcards", "stock.availability"],
  /** Service centre login: Service Calls · Job Cards (Estimate) · Serial Verification. */
  SERVICE_CENTER: ["service.complaints", "service.jobcards", "warranty.verify"],
};

/** Screens suggested for a role when an admin first sets up a user (they can then tick / untick freely). */
export const defaultFormsForRole = (role?: string | null) => SUGGESTED[role as RoleCode] || ALL_FORMS.filter((f) => f.roles.includes(role as RoleCode)).map((f) => f.key);

/** The form a page path belongs to (longest matching path), or null for pages anyone signed in may open (e.g. the dashboard). */
export function formForPath(pathname: string): FormDef | null {
  let best: FormDef | null = null;
  for (const f of ALL_FORMS) {
    if ((pathname === f.path || pathname.startsWith(`${f.path}/`)) && (!best || f.path.length > best.path.length)) best = f;
  }
  return best;
}

const ANY = "*";
/**
 * API prefix → forms that may call it (any one is enough). First match wins, so specific prefixes come first.
 * Lookups shared by several screens (e.g. the call list used by visits and job cards) list every screen that needs them.
 */
const API_RULES: [string, string[]][] = [
  ["/api/service/dashboard", ["service.dashboard"]],
  ["/api/Auth", [ANY]], ["/api/search", [ANY]], ["/api/dashboard", [ANY]], ["/api/masters/bootstrap", [ANY]], ["/api/upload", [ANY]],
  ["/api/masters/company/get", [ANY]], ["/api/masters/company", ["masters.company"]],
  ["/api/masters/product-models/get", [ANY]], ["/api/masters/product-models", ["masters.company"]],
  ["/api/admin/users/get", ["masters.users", "masters.approval-rules"]], ["/api/admin/users", ["masters.users"]],
  ["/api/masters/service-centers", ["masters.service-centers", "masters.service-engineers"]], ["/api/masters/service-engineers", ["masters.service-engineers"]],
  ["/api/warranty/stickers/get", ["warranty.serials", "warranty.register", "warranty.verify"]], ["/api/warranty/stickers", ["warranty.serials"]],
  ["/api/warranty/installations", ["warranty.register"]],
  ["/api/warranty/warranties/verify", ["warranty.verify", "warranty.search", "warranty.register", "service.complaints", "service.replacements"]],
  ["/api/warranty/warranties/update", ["warranty.active"]], ["/api/warranty/warranties/delete", ["warranty.active"]],
  ["/api/warranty/warranties", ["warranty.active", "warranty.register", "warranty.search"]],
  ["/api/warranty/replacement", ["warranty.replace"]],
  ["/api/warranty/search", ["warranty.search", "warranty.verify"]],
  ["/api/warranty/geo", ["warranty.geo"]],
  ["/api/warranty/dealers/get", ["warranty.dealers", "warranty.register", "warranty.active", "service.complaints", "service.replacements"]],
  ["/api/warranty/dealers", ["warranty.dealers"]],
  ["/api/warranty/customers", ["warranty.customers"]],
  ["/api/service/complaints/get", ["service.complaints", "service.reminders", "service.visits", "service.jobcards", "service.approvals", "service.replacements"]],
  ["/api/service/complaints", ["service.complaints"]],
  ["/api/service/reminders", ["service.reminders"]],
  ["/api/service/visits", ["service.visits"]],
  ["/api/service/jobcards", ["service.jobcards", "service.approvals"]],
  ["/api/service/replacements", ["service.replacements"]],
  ["/api/service/reports", ["service.reports"]],
  ["/api/service/dashboard", ["service.dashboard"]],
  ["/api/stock/balance", ["stock.availability", "stock.engineer", "service.jobcards"]],
  ["/api/stock/consumption", ["stock.consumption"]],
  ["/api/stock/txns", ["stock.ledger"]],
  ["/api/stock/material-requests/decide", ["stock.request-approvals"]],
  ["/api/stock/material-requests/get", ["stock.requests", "stock.request-approvals"]],
  ["/api/stock/material-requests", ["stock.requests"]],
  ["/api/stock/challans", ["stock.challans"]],
  ["/api/masters/text-lists", ["masters.text-lists"]],
  ["/api/system", ["system.activity"]],
];

/** Whether the user may call this API. Config masters: reading is open (dropdowns), writing needs that master's form. */
export function canUseApi(user: AccessUser | null | undefined, pathname: string, method: string) {
  if (!user) return false;
  const config = pathname.match(/^\/api\/masters\/config\/([^/]+)/);
  if (config) return method === "GET" || canUseForm(user, `masters.${config[1]}`);
  const rule = API_RULES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!rule) return true;
  return rule[1].includes(ANY) || rule[1].some((key) => canUseForm(user, key));
}
