"use client";

import { DistrictSelect } from "@/components/common/DistrictSelect";
import React, { useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Alert,
  Divider,
  Tag,
  message,
  Result,
} from "antd";
import {
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  ShopOutlined,
  ArrowRightOutlined,
  UserOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { reportFormError } from "@/lib/utils/formErrors";
import Link from "next/link";
import dayjs from "dayjs";

export default function RegisterWarrantyPage() {
  const [form] = Form.useForm();
  const { addFullInstallation, isLoading } = useWarrantyStore();
  const { states, productModels, projects } = useMasterStore();

  const [submittedResult, setSubmittedResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pumpModels = productModels.filter((m) => m.Category === "PUMP");
  const motorModels = productModels.filter((m) => m.Category === "MOTOR");
  const controllerModels = productModels.filter((m) => m.Category === "CONTROLLER");

  const handleSubmit = async (values: any) => {
    try {
      setSubmitting(true);

      const components = [
        {
          serialNo: values.pumpSerial,
          category: "PUMP",
          productModelId: values.pumpModelId,
          warrantyMonths: 24,
        },
        {
          serialNo: values.motorSerial,
          category: "MOTOR",
          productModelId: values.motorModelId,
          warrantyMonths: 24,
        },
        {
          serialNo: values.controllerSerial,
          category: "CONTROLLER",
          productModelId: values.controllerModelId,
          warrantyMonths: 36,
        },
      ].filter((c) => Boolean(c.serialNo));

      const payload = {
        customerName: values.customerName,
        mobile: values.mobile,
        siteAddress: values.siteAddress,
        village: values.village,
        district: values.district,
        stateId: values.stateId,
        pincode: values.pincode,
        projectId: values.projectId,
        dealerId: values.dealerId,
        installDate: values.installDate ? values.installDate.toISOString() : new Date().toISOString(),
        borewellDepthM: values.borewellDepthM,
        dynamicHeadM: values.dynamicHeadM,
        panelKwp: values.panelKwp,
        invoiceNo: values.invoiceNo,
        remarks: values.remarks,
        components,
      };

      const result = await addFullInstallation(payload);
      setSubmittedResult(result);
      message.success("Installation and warranties registered successfully!");
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Failed to register installation and warranties" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <Card className="shadow-lg border-slate-200 rounded-2xl p-6 text-center">
          <Result
            status="success"
            title="Warranty Successfully Registered!"
            subTitle={`Installation Reference: ${submittedResult.installation?.InstallNo}`}
            extra={[
              <Link key="active" href="/warranty/active">
                <Button type="primary" size="large" className="bg-blue-600">
                  View in Active Warranties
                </Button>
              </Link>,
              <Button
                key="new"
                size="large"
                onClick={() => {
                  setSubmittedResult(null);
                  form.resetFields();
                }}
              >
                Register Another Installation
              </Button>,
            ]}
          />

          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Registered Component Warranties:
            </h4>
            <div className="space-y-2">
              {submittedResult.warranties?.map((w: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 text-sm"
                >
                  <div className="flex items-center space-x-2">
                    <Tag color="blue">{w.Category}</Tag>
                    <span className="font-mono font-bold text-slate-800">{w.SerialNo}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Warranty No: <span className="font-semibold text-slate-700">{w.WarrantyNo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <SafetyCertificateOutlined className="text-blue-600" />
            Register Solar Pump Installation & Warranties
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Add customer and site details, then register the pump, motor, and controller warranties.
          </p>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          installDate: dayjs(),
          borewellDepthM: 60,
          dynamicHeadM: 45,
          panelKwp: "3.0",
        }}
        requiredMark={false}
      >
        {/* Section 1: Customer & Site Details */}
        <Card
          title={
            <div className="flex items-center space-x-2 text-slate-800 text-sm font-bold">
              <UserOutlined className="text-blue-600" />
              <span>1. Beneficiary Customer & Site Location</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl"
        >
          <div className="form-grid form-grid-three">
            <Form.Item
              name="customerName"
              label={<span className="text-xs font-semibold text-slate-700">Customer Name</span>}
              rules={[{ required: true, message: "Customer name is required" }]}
            >
              <Input placeholder="e.g. Ramesh Kumar Patel" />
            </Form.Item>

            <Form.Item
              name="mobile"
              label={<span className="text-xs font-semibold text-slate-700">Primary Mobile</span>}
              rules={[{ required: true, message: "10-digit mobile number is required" }]}
            >
              <Input placeholder="e.g. 9810101001" maxLength={10} />
            </Form.Item>

            <Form.Item
              name="stateId"
              label={<span className="text-xs font-semibold text-slate-700">State</span>}
              rules={[{ required: true, message: "State is required" }]}
            >
              <Select placeholder="Select state">
                {states.map((s) => (
                  <Select.Option key={s.StateId} value={s.StateId}>
                    {s.StateName} ({s.StateCode})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="district"
              label={<span className="text-xs font-semibold text-slate-700">District</span>}
              rules={[{ required: true, message: "District is required" }]}
            ><DistrictSelect stateField="stateId" />
            </Form.Item>

            <Form.Item
              name="village"
              label={<span className="text-xs font-semibold text-slate-700">Village / Tehsil</span>}
            >
              <Input placeholder="e.g. Sikri Kalan" />
            </Form.Item>

            <Form.Item
              name="pincode"
              label={<span className="text-xs font-semibold text-slate-700">Pincode</span>}
            >
              <Input placeholder="e.g. 250103" maxLength={6} />
            </Form.Item>
          </div>

          <Form.Item
            name="siteAddress"
            label={<span className="text-xs font-semibold text-slate-700">Full Site Address</span>}
          >
            <Input.TextArea rows={2} placeholder="Khet / Farm location, landmarks..." />
          </Form.Item>
        </Card>

        {/* Section 2: Installation Technical Data */}
        <Card
          title={
            <div className="flex items-center space-x-2 text-slate-800 text-sm font-bold">
              <EnvironmentOutlined className="text-blue-600" />
              <span>2. Installation Details & Scheme</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl mt-4"
        >
          <div className="form-grid form-grid-four">
            <Form.Item
              name="installDate"
              label={<span className="text-xs font-semibold text-slate-700">Installation Date</span>}
              rules={[{ required: true, message: "Install date is required" }]}
            >
              <SmartDatePicker placeholder="Select or type date" />
            </Form.Item>

            <Form.Item
              name="projectId"
              label={<span className="text-xs font-semibold text-slate-700">Project / Scheme</span>}
            >
              <Select placeholder="Select Scheme">
                {projects.map((p) => (
                  <Select.Option key={p.ProjectId} value={p.ProjectId}>
                    {p.ProjectName}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="borewellDepthM"
              label={<span className="text-xs font-semibold text-slate-700">Borewell Depth (m)</span>}
            >
              <Input type="number" placeholder="60" />
            </Form.Item>

            <Form.Item
              name="panelKwp"
              label={<span className="text-xs font-semibold text-slate-700">Solar Array (kWp)</span>}
            >
              <Input placeholder="3.0" />
            </Form.Item>
          </div>
        </Card>

        {/* Section 3: 3 Component Serials (Pump, Motor, Controller) */}
        <Card
          title={
            <div className="flex items-center space-x-2 text-slate-800 text-sm font-bold">
              <ThunderboltOutlined className="text-blue-600" />
              <span>3. Component Serial Numbers & Product Models</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl mt-4"
        >
          <div className="space-y-4">
            {/* Component 1: Pump */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Tag color="blue" className="font-bold">
                  COMPONENT 1: PUMP
                </Tag>
                <span className="text-xs text-slate-500 font-medium">
                  24 Months standard warranty
                </span>
              </div>
              <div className="form-grid form-grid-two">
                <Form.Item
                  name="pumpSerial"
                  label={<span className="text-xs font-semibold text-slate-700">Pump Serial No</span>}
                  rules={[{ required: true, message: "Pump serial number is required" }]}
                >
                  <Input placeholder="e.g. 2404PU30001" className="font-mono uppercase" />
                </Form.Item>
                <Form.Item
                  name="pumpModelId"
                  label={<span className="text-xs font-semibold text-slate-700">Pump Model</span>}
                  rules={[{ required: true, message: "Pump model is required" }]}
                >
                  <Select placeholder="Select pump model">
                    {pumpModels.map((m) => (
                      <Select.Option key={m.ProductModelId} value={m.ProductModelId}>
                        {m.ModelName} ({m.ModelCode})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </div>

            {/* Component 2: Motor */}
            <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-xl">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Tag color="cyan" className="font-bold">
                  COMPONENT 2: MOTOR
                </Tag>
                <span className="text-xs text-slate-500 font-medium">
                  24 Months standard warranty
                </span>
              </div>
              <div className="form-grid form-grid-two">
                <Form.Item
                  name="motorSerial"
                  label={<span className="text-xs font-semibold text-slate-700">Motor Serial No</span>}
                  rules={[{ required: true, message: "Motor serial number is required" }]}
                >
                  <Input placeholder="e.g. 2404MO30001" className="font-mono uppercase" />
                </Form.Item>
                <Form.Item
                  name="motorModelId"
                  label={<span className="text-xs font-semibold text-slate-700">Motor Model</span>}
                  rules={[{ required: true, message: "Motor model is required" }]}
                >
                  <Select placeholder="Select motor model">
                    {motorModels.map((m) => (
                      <Select.Option key={m.ProductModelId} value={m.ProductModelId}>
                        {m.ModelName} ({m.ModelCode})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </div>

            {/* Component 3: Controller */}
            <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Tag color="purple" className="font-bold">
                  COMPONENT 3: CONTROLLER
                </Tag>
                <span className="text-xs text-slate-500 font-medium">
                  36 Months standard warranty
                </span>
              </div>
              <div className="form-grid form-grid-two">
                <Form.Item
                  name="controllerSerial"
                  label={
                    <span className="text-xs font-semibold text-slate-700">
                      Controller Serial No
                    </span>
                  }
                  rules={[{ required: true, message: "Controller serial number is required" }]}
                >
                  <Input placeholder="e.g. 2404CT30001" className="font-mono uppercase" />
                </Form.Item>
                <Form.Item
                  name="controllerModelId"
                  label={<span className="text-xs font-semibold text-slate-700">Controller Model</span>}
                  rules={[{ required: true, message: "Controller model is required" }]}
                >
                  <Select placeholder="Select controller model">
                    {controllerModels.map((m) => (
                      <Select.Option key={m.ProductModelId} value={m.ProductModelId}>
                        {m.ModelName} ({m.ModelCode})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </div>
          </div>
        </Card>

        <div className="form-actions">
          <Button size="large" onClick={() => form.resetFields()}>
            Reset Form
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={submitting || isLoading}
            className="bg-blue-600 shadow-md font-semibold px-8"
          >
            Register Installation
          </Button>
        </div>
      </Form>
    </div>
  );
}
