/** Shared option lists for service, stock and replacement forms (used by both API routes and pages). */
export const VISIT_OUTCOMES = ["Resolved at site", "Spares required", "Job card required", "Replacement required", "Customer not available"];

export const CALL_SOURCES = ["Customer", "Dealer", "Toll Free", "WhatsApp", "Marketing", "HO", "Mobile App"];
export const CALL_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
/** Overall warranty of a call, from its components: every part in warranty / some / none / unknown serials. */
export const CALL_WARRANTY_STATUSES = ["In Warranty", "Partial", "Out of Warranty", "Not Registered"];

/** Job cards need at least one photo; up to this many. */
export const MAX_JOBCARD_PHOTOS = 10;

export const JOBCARD_STATUSES = ["Draft", "In Approval", "Approved", "Rejected", "Closed"];

export const REPLACEMENT_TYPES = ["Invoice", "Delivery Challan", "Credit Note"];
export const VOUCHER_TYPES = ["With Serial No", "Without Serial No"];
/** A replacement booked "Without Serial No" cannot be traced to a warranty, so it is always out of warranty. */
export const WITHOUT_SERIAL = "Without Serial No";
/** Replacement documents: at least one PDF is mandatory, up to this many (5 MB each). */
export const MAX_REPLACEMENT_PDFS = 5;
/** Videos on service calls and job cards (uploaded separately through /api/attachments/upload, then linked on save). */
export const MAX_VIDEOS = 3;
export const MAX_VIDEO_MB = 50;
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/3gpp,.mp4,.webm,.mov,.3gp";
export const REPLACEMENT_STATUSES = ["Open", "Received", "Closed", "Cancelled"];
export const PRODUCT_CATEGORIES = ["PUMP", "MOTOR", "CONTROLLER"];

/** Stock locations: SC = service-centre store, ENG = engineer van, DAMAGED = faulty-parts bin at a service centre. */
export const STOCK_LOCATION_TYPES = ["SC", "ENG", "DAMAGED"] as const;

/** Each transaction type and the locations it moves stock between. */
export const STOCK_TXN_TYPES: Record<string, { label: string; from: boolean; to: boolean; hint: string }> = {
  Opening: { label: "Opening stock", from: false, to: true, hint: "Starting balance at a store or engineer van" },
  Receipt: { label: "Receipt from supplier", from: false, to: true, hint: "Spares received from the factory or a supplier" },
  Transfer: { label: "Transfer", from: true, to: true, hint: "Move stock between stores and engineer vans" },
  "Issue-Out": { label: "Issue out", from: true, to: false, hint: "Stock issued outside the service network" },
  "Return-Damaged": { label: "Faulty part return", from: false, to: true, hint: "Faulty part held at a store for warranty claim" },
  "Adjust-In": { label: "Adjustment (+)", from: false, to: true, hint: "Correct a physical count upward" },
  "Adjust-Out": { label: "Adjustment (−)", from: true, to: false, hint: "Correct a physical count downward" },
};
