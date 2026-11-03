"use client";
import { Form, Select } from "antd";
import { useMasterStore } from "@/lib/store/useMasterStore";
export function DistrictSelect({ stateField, value, onChange }: { stateField: string; value?: string; onChange?: (value?: string) => void }) {
  const stateId = Form.useWatch(stateField);
  const districts = useMasterStore(s => s.districts);
  return <Select value={value} onChange={onChange} showSearch allowClear optionFilterProp="label" placeholder="Select district" options={districts.filter(d => !stateId || d.StateId === stateId).map(d => ({value:d.DistrictName,label:d.DistrictName}))} />;
}
