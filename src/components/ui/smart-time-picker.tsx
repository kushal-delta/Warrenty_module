"use client";

import React from "react";
import { TimePicker } from "antd";
import type { TimePickerProps } from "antd";
import dayjs, { Dayjs } from "dayjs";

export interface SmartTimePickerProps extends Omit<TimePickerProps, "onChange" | "value"> {
  value?: Dayjs | string | null;
  onChange?: (time: Dayjs | null, timeString: string) => void;
}

export const SmartTimePicker: React.FC<SmartTimePickerProps> = ({
  value,
  onChange,
  format = "hh:mm A",
  use12Hours = true,
  needConfirm = false,
  ...restProps
}) => {
  const dayjsValue = value ? (dayjs.isDayjs(value) ? value : dayjs(value)) : null;

  return (
    <TimePicker
      {...restProps}
      value={dayjsValue}
      format={format}
      use12Hours={use12Hours}
      needConfirm={needConfirm}
      onChange={(time, timeString) => {
        if (onChange) {
          const singleTime = Array.isArray(time) ? time[0] : time;
          onChange(singleTime as Dayjs | null, Array.isArray(timeString) ? timeString[0] : timeString);
        }
      }}
      className={`w-full ${restProps.className || ""}`}
    />
  );
};

export default SmartTimePicker;
