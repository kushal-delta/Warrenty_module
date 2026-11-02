"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, Card, message, Divider } from "antd";
import { BankOutlined, SaveOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { reportFormError } from "@/lib/utils/formErrors";

export default function CompanyProfilePage() {
  const [form] = Form.useForm();
  const { company, updateCompany, isLoading } = useMasterStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      form.setFieldsValue({ ...company });
    }
  }, [company, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await updateCompany(values);
      message.success("Company profile & warranty terms updated in database");
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Failed to update company profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BankOutlined className="text-blue-600" />
            Company Profile & Warranty Policies
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Legal identity, warranty card terms, and official contact channels for customer service
          </p>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving || isLoading}
          className="bg-blue-600"
        >
          Save Changes
        </Button>
      </div>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Card title="Company Identity" className="shadow-xs border-slate-200 rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              name="CompanyName"
              label={<span className="text-xs font-semibold text-slate-700">Company Name</span>}
              rules={[{ required: true, message: "Company name is required" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="Tagline"
              label={<span className="text-xs font-semibold text-slate-700">Tagline / Brand Line</span>}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="Gstin"
              label={<span className="text-xs font-semibold text-slate-700">GSTIN</span>}
            >
              <Input placeholder="e.g. 09ABBCS3892H1ZZ" />
            </Form.Item>

            <Form.Item
              name="WhatsappSender"
              label={<span className="text-xs font-semibold text-slate-700">Official WhatsApp Sender</span>}
            >
              <Input placeholder="+91 90000 00000" />
            </Form.Item>
          </div>
        </Card>

        <Card title="Contact Channels & Office Address" className="shadow-xs border-slate-200 rounded-xl mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item
              name="TollFree"
              label={<span className="text-xs font-semibold text-slate-700">Toll-Free Helpline</span>}
            >
              <Input placeholder="1800-000-0000" />
            </Form.Item>

            <Form.Item
              name="Phone"
              label={<span className="text-xs font-semibold text-slate-700">Office Phone</span>}
            >
              <Input placeholder="0120-0000000" />
            </Form.Item>

            <Form.Item
              name="Email"
              label={<span className="text-xs font-semibold text-slate-700">Service Email</span>}
            >
              <Input placeholder="service@solartive.example" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item
              name="City"
              label={<span className="text-xs font-semibold text-slate-700">City</span>}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="State"
              label={<span className="text-xs font-semibold text-slate-700">State</span>}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="Pincode"
              label={<span className="text-xs font-semibold text-slate-700">Pincode</span>}
            >
              <Input />
            </Form.Item>
          </div>

          <Form.Item
            name="Address"
            label={<span className="text-xs font-semibold text-slate-700">Plant / Office Address</span>}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
        </Card>

        <Card title="Standard Warranty Terms & Conditions" className="shadow-xs border-slate-200 rounded-xl mt-4">
          <p className="text-xs text-slate-500 mb-2">
            These terms are printed on digital warranty cards and generated certificates.
          </p>
          <Form.Item name="WarrantyTerms">
            <Input.TextArea rows={6} className="font-sans text-xs leading-relaxed" />
          </Form.Item>
        </Card>
      </Form>
    </div>
  );
}
