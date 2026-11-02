import dayjs from "dayjs";

/**
 * RULES §1 & §18: Date Formatting helper
 * @param date Value to format (string, Date, dayjs, or null/undefined)
 * @param withTime Pass true for timestamp/audit columns (InsertedOn, LastUpdatedOn, LogOn, etc.)
 */
export function formatDate(
  date: string | Date | dayjs.Dayjs | null | undefined,
  withTime: boolean = false
): string {
  if (!date) return "-";
  const parsed = dayjs(date);
  if (!parsed.isValid()) return "-";

  return withTime
    ? parsed.format("DD/MM/YYYY hh:mm A")
    : parsed.format("DD/MM/YYYY");
}

export function formatTime(
  date: string | Date | dayjs.Dayjs | null | undefined
): string {
  if (!date) return "-";
  const parsed = dayjs(date);
  if (!parsed.isValid()) return "-";
  return parsed.format("hh:mm A");
}
