"use client";
import { useMemo } from "react";
import { Form, Select } from "antd";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { districtOptions } from "@/lib/utils/selectOptions";
export function DistrictSelect({ stateField, value, onChange }: { stateField: string; value?: string; onChange?: (value?: string) => void }) {
  const stateId = Form.useWatch(stateField);
  const districts = useMasterStore(s => s.districts);
  // Unique names only: the ERP districts master repeats names, which breaks the dropdown's scrolling.
  const options = useMemo(() => districtOptions(districts, stateId), [districts, stateId]);
  return <Select value={value} onChange={onChange} showSearch allowClear optionFilterProp="label" placeholder="Select district" options={options} />;
}
