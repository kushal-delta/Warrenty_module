"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Drawer,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Tooltip,
  message,
} from "antd";
import {
  CustomerServiceOutlined,
  PlusOutlined,
  EditOutlined,
  UserSwitchOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import { useServiceStore, Complaint } from "@/lib/store/useServiceStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import {
  DrawerHeader,
  DrawerChip,
  DRAWER_WIDTH,
  DRAWER_HEADER_STYLE,
} from "@/components/common/DrawerHeader";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import dayjs from "dayjs";

export default function ComplaintsPage() {
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [closeForm] = Form.useForm();

  const {
    complaints,
    fetchComplaints,
    addComplaint,
    assignComplaint,
    closeComplaint,
    isLoading,
  } = useServiceStore();

  const { callTypes, serviceCenters, projects, states } = useMasterStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

  // Drawer state for Log Complaint
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [saving, setSaving] = useState(false);

  // Assign Modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningComplaint, setAssigningComplaint] = useState<Complaint | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Close Ticket Modal state
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingComplaint, setClosingComplaint] = useState<Complaint | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      callDate: dayjs(),
      priority: "Medium",
      source: "Customer Call",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        callDate: values.callDate ? values.callDate.toISOString() : new Date().toISOString(),
      };

      await addComplaint(payload);
      message.success("Service ticket logged in database successfully");
      setDrawerOpen(false);
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Could not log complaint" });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSubmit = async () => {
    try {
      const values = await assignForm.validateFields();
      if (!assigningComplaint) return;
      setAssigning(true);

      await assignComplaint({
        ComplaintId: assigningComplaint.ComplaintId,
        EngineerUserId: values.engineerUserId,
        ServiceCenterId: values.serviceCenterId,
      });

      message.success(`Ticket ${assigningComplaint.ComplaintNo} assigned to engineer`);
      setAssignModalOpen(false);
      setAssigningComplaint(null);
    } catch (err: any) {
      reportFormError(err, { form: assignForm, fallback: "Could not assign engineer" });
    } finally {
      setAssigning(false);
    }
  };

  const handleCloseSubmit = async () => {
    try {
      const values = await closeForm.validateFields();
      if (!closingComplaint) return;
      setClosing(true);

      await closeComplaint({
        ComplaintId: closingComplaint.ComplaintId,
        Resolution: values.resolution,
        Status: "Closed",
      });

      message.success(`Ticket ${closingComplaint.ComplaintNo} marked as resolved and closed`);
      setCloseModalOpen(false);
      setClosingComplaint(null);
    } catch (err: any) {
      reportFormError(err, { form: closeForm, fallback: "Could not close ticket" });
    } finally {
      setClosing(false);
    }
  };

  const columns = [
    {
      title: "Ticket No",
      dataIndex: "ComplaintNo",
      key: "ComplaintNo",
      width: 140,
      render: (no: string) => (
        <span className="font-mono font-bold text-blue-700 tracking-tight">{no}</span>
      ),
    },
    {
      title: "Call Date",
      dataIndex: "CallDate",
      key: "CallDate",
      width: 110,
      render: (val: string) => formatDate(val, false),
    },
    {
      title: "Customer & Site",
      key: "customer",
      render: (_: any, row: Complaint) => (
        <div>
          <div className="font-semibold text-slate-800">{row.CustomerName}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
            <PhoneOutlined className="text-slate-400" />
            <span className="font-mono">{row.Mobile}</span>
            {row.Village && <span>• {row.Village}</span>}
            {row.District && <span>({row.District})</span>}
          </div>
        </div>
      ),
    },
    {
      title: "Issue Reported",
      dataIndex: "ComplaintText",
      key: "ComplaintText",
      render: (text: string, row: Complaint) => (
        <div>
          <div className="text-xs text-slate-700 whitespace-normal break-words leading-tight">
            {text}
          </div>
          {row.CallTypeName && (
            <div className="text-[11px] text-blue-600 font-medium mt-1">
              Type: {row.CallTypeName}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Priority",
      dataIndex: "Priority",
      key: "Priority",
      width: 100,
      render: (p: string) => {
        const color = p === "High" ? "red" : p === "Urgent" ? "magenta" : "orange";
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "Status",
      key: "Status",
      width: 120,
      render: (s: string) => {
        const color =
          s === "New"
            ? "blue"
            : s === "Assigned"
            ? "purple"
            : s === "Visited"
            ? "cyan"
            : s === "Closed" || s === "Resolved"
            ? "green"
            : "default";
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: "Assigned To",
      dataIndex: "EngineerName",
      key: "EngineerName",
      width: 140,
      render: (name: string, row: Complaint) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{name || "Unassigned"}</div>
          {row.ServiceCenterName && (
            <div className="text-[11px] text-slate-400">{row.ServiceCenterName}</div>
          )}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 110,
      render: (_: any, row: Complaint) => (
        <Space size="small">
          {row.Status !== "Closed" && (
            <Tooltip title="Assign Service Engineer">
              <Button
                type="text"
                size="small"
                icon={<UserSwitchOutlined className="text-purple-600" />}
                onClick={() => {
                  setAssigningComplaint(row);
                  assignForm.resetFields();
                  assignForm.setFieldsValue({
                    serviceCenterId: row.ServiceCenterId,
                  });
                  setAssignModalOpen(true);
                }}
              />
            </Tooltip>
          )}

          {row.Status !== "Closed" && (
            <Tooltip title="Resolve & Close Ticket">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined className="text-green-600" />}
                onClick={() => {
                  setClosingComplaint(row);
                  closeForm.resetFields();
                  setCloseModalOpen(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const filtered = complaints.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      c.ComplaintNo.toLowerCase().includes(q) ||
      c.CustomerName.toLowerCase().includes(q) ||
      c.Mobile.includes(q) ||
      (c.Village && c.Village.toLowerCase().includes(q)) ||
      (c.ComplaintText && c.ComplaintText.toLowerCase().includes(q));
    const matchStatus = !statusFilter || c.Status === statusFilter;
    const matchPriority = !priorityFilter || c.Priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CustomerServiceOutlined className="text-blue-600" />
            Service & Complaints Register
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer service center breakdown calls, field visits, and engineer assignments
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchComplaints()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            className="bg-blue-600 shadow-sm"
          >
            Log Complaint
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search tickets by No, Customer Name, Mobile, Village..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="w-80"
        />

        <Select
          placeholder="All Statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="w-36"
        >
          <Select.Option value="New">New</Select.Option>
          <Select.Option value="Assigned">Assigned</Select.Option>
          <Select.Option value="Visited">Visited</Select.Option>
          <Select.Option value="Closed">Closed</Select.Option>
        </Select>

        <Select
          placeholder="All Priorities"
          value={priorityFilter}
          onChange={setPriorityFilter}
          allowClear
          className="w-36"
        >
          <Select.Option value="High">High</Select.Option>
          <Select.Option value="Medium">Medium</Select.Option>
          <Select.Option value="Low">Low</Select.Option>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="ComplaintId"
          size="middle"
          loading={isLoading}
          pagination={{ pageSize: 15 }}
          scroll={{ x: 1000 }}
        />
      </div>

      {/* Log Complaint Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        closable={false}
        width={maximized ? "100%" : DRAWER_WIDTH}
        styles={{ header: DRAWER_HEADER_STYLE }}
        destroyOnClose
        title={
          <DrawerHeader
            icon={<CustomerServiceOutlined />}
            title="Log Customer Complaint Ticket"
            subtitle="Register new service call ticket in PostgreSQL database"
            meta={<DrawerChip label="New Service Call" tone="solid" />}
            maximized={maximized}
            onToggleMaximize={() => setMaximized(!maximized)}
            onClose={() => setDrawerOpen(false)}
          />
        }
        footer={
          <div className="flex items-center justify-end space-x-2 py-2">
            <Button onClick={() => setDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">
              Save Complaint Ticket
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false} className="py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
            <Form.Item
              name="callDate"
              label={<span className="text-xs font-semibold text-slate-700">Call Date</span>}
              rules={[{ required: true }]}
            >
              <SmartDatePicker placeholder="Select or type date" />
            </Form.Item>

            <Form.Item
              name="callTypeId"
              label={<span className="text-xs font-semibold text-slate-700">Call Type</span>}
              rules={[{ required: true, message: "Call type is required" }]}
            >
              <Select placeholder="Select call type">
                {callTypes.map((ct) => (
                  <Select.Option key={ct.CallTypeId} value={ct.CallTypeId}>
                    {ct.CallTypeName}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="priority"
              label={<span className="text-xs font-semibold text-slate-700">Priority</span>}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="Low">Low</Select.Option>
                <Select.Option value="Medium">Medium</Select.Option>
                <Select.Option value="High">High</Select.Option>
                <Select.Option value="Urgent">Urgent</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="customerName"
              label={<span className="text-xs font-semibold text-slate-700">Customer Name</span>}
              rules={[{ required: true, message: "Customer name is required" }]}
            >
              <Input placeholder="e.g. Gopal Sharma" />
            </Form.Item>

            <Form.Item
              name="mobile"
              label={<span className="text-xs font-semibold text-slate-700">Customer Mobile</span>}
              rules={[{ required: true, message: "Mobile number is required" }]}
            >
              <Input placeholder="e.g. 9414101017" maxLength={10} />
            </Form.Item>

            <Form.Item
              name="serviceCenterId"
              label={<span className="text-xs font-semibold text-slate-700">Service Center</span>}
            >
              <Select placeholder="Select regional center">
                {serviceCenters.map((sc) => (
                  <Select.Option key={sc.ServiceCenterId} value={sc.ServiceCenterId}>
                    {sc.ServiceCenterName}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="village"
              label={<span className="text-xs font-semibold text-slate-700">Village / Tehsil</span>}
            >
              <Input placeholder="e.g. Phagi" />
            </Form.Item>

            <Form.Item
              name="district"
              label={<span className="text-xs font-semibold text-slate-700">District</span>}
            >
              <Input placeholder="e.g. Jaipur" />
            </Form.Item>

            <Form.Item
              name="stateId"
              label={<span className="text-xs font-semibold text-slate-700">State</span>}
            >
              <Select placeholder="Select state">
                {states.map((s) => (
                  <Select.Option key={s.StateId} value={s.StateId}>
                    {s.StateName}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            name="complaintText"
            label={
              <span className="text-xs font-semibold text-slate-700">
                Problem Description / Reported Fault
              </span>
            }
            rules={[{ required: true, message: "Complaint description is required" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Describe the breakdown symptoms, discharge issues, controller trip code, or motor heating..."
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Assign Engineer Modal */}
      <Modal
        open={assignModalOpen}
        title="Assign Service Engineer"
        onCancel={() => setAssignModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAssignModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={handleAssignSubmit}
            loading={assigning}
            className="bg-blue-600"
          >
            Assign Engineer
          </Button>,
        ]}
      >
        <Form form={assignForm} layout="vertical" requiredMark={false} className="py-2">
          <p className="text-xs text-slate-500 mb-4">
            Assign ticket <span className="font-bold text-slate-800">{assigningComplaint?.ComplaintNo}</span> to a field service engineer.
          </p>

          <Form.Item
            name="serviceCenterId"
            label={<span className="text-xs font-semibold text-slate-700">Service Center</span>}
          >
            <Select placeholder="Select regional center">
              {serviceCenters.map((sc) => (
                <Select.Option key={sc.ServiceCenterId} value={sc.ServiceCenterId}>
                  {sc.ServiceCenterName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="engineerUserId"
            label={<span className="text-xs font-semibold text-slate-700">Assign Field Engineer</span>}
            rules={[{ required: true, message: "Please select an engineer" }]}
          >
            <Select placeholder="Select engineer">
              <Select.Option value="242b2d94-7e53-4b78-8ee0-f31c9ddb7056">
                Pradeep Kumar (Greater Noida)
              </Select.Option>
              <Select.Option value="242b2d94-7e53-4b78-8ee0-f31c9ddb7056">
                Rahul Chauhan (Greater Noida)
              </Select.Option>
              <Select.Option value="242b2d94-7e53-4b78-8ee0-f31c9ddb7056">
                Mohan Lal Saini (Jaipur)
              </Select.Option>
              <Select.Option value="242b2d94-7e53-4b78-8ee0-f31c9ddb7056">
                Rakesh Patidar (Indore)
              </Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Close Ticket Modal */}
      <Modal
        open={closeModalOpen}
        title="Resolve & Close Ticket"
        onCancel={() => setCloseModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCloseModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={handleCloseSubmit}
            loading={closing}
            className="bg-green-600 border-none"
          >
            Confirm & Close Ticket
          </Button>,
        ]}
      >
        <Form form={closeForm} layout="vertical" requiredMark={false} className="py-2">
          <p className="text-xs text-slate-500 mb-3">
            Record resolution details to close ticket{" "}
            <span className="font-bold text-slate-800">{closingComplaint?.ComplaintNo}</span>.
          </p>

          <Form.Item
            name="resolution"
            label={<span className="text-xs font-semibold text-slate-700">Resolution Remarks</span>}
            rules={[{ required: true, message: "Resolution remarks are required to close ticket" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="e.g. Replaced worn impellers, cleaned sand from pump suction, tested discharge normal at 50,000 L/day."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
