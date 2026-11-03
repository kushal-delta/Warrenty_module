/** Shared option lists for service, stock and replacement forms (used by both API routes and pages). */
export const VISIT_OUTCOMES = ["Resolved at site", "Spares required", "Job card required", "Replacement required", "Customer not available"];

export const JOBCARD_STATUSES = ["Draft", "In Approval", "Approved", "Rejected", "Closed"];

export const REPLACEMENT_TYPES = ["Invoice", "Delivery Challan", "Credit Note"];
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
