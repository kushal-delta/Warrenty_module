"use client";

import React, { useState } from "react";
import { DatePicker } from "antd";
import type { DatePickerProps } from "antd";
import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

export interface SmartDatePickerProps extends Omit<DatePickerProps, "onChange" | "value"> {
  value?: Dayjs | string | null;
  onChange?: (date: Dayjs | null, dateString: string) => void;
  showTime?: boolean | object;
}

/**
 * Parses free-text user inputs into a Dayjs date:
 * - "t" or "today" -> today
 * - single/double digits e.g. "5" or "24" -> 5th or 24th of current month
 * - standard formats: "DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "D MMM YY", "D MMM YYYY", "MMM YY"
 */
function parseSmartDate(text: string, referenceDate: Dayjs = dayjs()): Dayjs | null {
  const clean = text.trim().toLowerCase();
  if (!clean) return null;

  if (clean === "t" || clean === "today") {
    return referenceDate.startOf("day");
  }

  // Pure digits: e.g. "5" -> 5th of current month
  if (/^\d{1,2}$/.test(clean)) {
    const day = parseInt(clean, 10);
    const candidate = referenceDate.date(day);
    return candidate.isValid() ? candidate : null;
  }

  const formats = [
    "DD/MM/YYYY",
    "DD-MM-YYYY",
    "YYYY-MM-DD",
    "D MMM YYYY",
    "D MMMM YYYY",
    "D MMM YY",
    "DD/MM/YY",
    "DD-MM-YY",
    "MMM YYYY",
    "MMM YY",
  ];

  for (const fmt of formats) {
    const parsed = dayjs(clean, fmt, true);
    if (parsed.isValid()) return parsed;
  }

  // Fallback to non-strict dayjs parse
  const loose = dayjs(clean);
  return loose.isValid() ? loose : null;
}

/**
 * RULES §20, §22, §45: SmartDatePicker
 * Drop-in replacement for Ant Design DatePicker with free-text typing support and 12-hour AM/PM defaults.
 */
export const SmartDatePicker: React.FC<SmartDatePickerProps> = ({
  value,
  onChange,
  showTime,
  format,
  placeholder,
  ...restProps
}) => {
  const dayjsValue = value ? (dayjs.isDayjs(value) ? value : dayjs(value)) : null;
  const isTimeEnabled = Boolean(showTime);

  const effectiveFormat =
    format || (isTimeEnabled ? "DD/MM/YYYY hh:mm A" : "DD/MM/YYYY");

  const effectiveShowTime = isTimeEnabled
    ? typeof showTime === "object"
      ? showTime
      : { use12Hours: true, format: "hh:mm A" }
    : false;

  return (
    <DatePicker
      {...restProps}
      value={dayjsValue}
      format={effectiveFormat}
      showTime={effectiveShowTime}
      placeholder={placeholder || (isTimeEnabled ? "DD/MM/YYYY hh:mm A" : "DD/MM/YYYY")}
      onChange={(date, dateString) => {
        if (onChange) {
          const singleDate = Array.isArray(date) ? date[0] : date;
          onChange(singleDate as Dayjs | null, Array.isArray(dateString) ? dateString[0] : dateString);
        }
      }}
      className={`w-full ${restProps.className || ""}`}
    />
  );
};

export default SmartDatePicker;
