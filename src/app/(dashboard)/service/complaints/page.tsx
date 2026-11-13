"use client";

import { FormSection } from "@/components/common/FormSection";
import { DistrictSelect } from "@/components/common/DistrictSelect";
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
  ReloadOutlined,
  PhoneOutlined,
  EyeOutlined,
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
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { ServiceCallFormDrawer } from "@/components/service/ServiceCallFormDrawer";
import { ServiceCallDetailDrawer, ServiceCallDetails } from "@/components/service/ServiceCallDetailDrawer";
import { ServiceCallProgress } from "@/components/service/ServiceCallProgress";
import dayjs from "dayjs";
import { StatStrip } from "@/components/common/PageHeader";
import axios from "axios";
import { DeleteOutlined } from "@ant-design/icons";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { FilterBar } from "@/components/common/FilterBar";
import { AlertOutlined, CalendarOutlined, EnvironmentOutlined, FlagOutlined, ProjectOutlined, SafetyOutlined, ShopOutlined, TagsOutlined, UserOutlined } from "@ant-design/icons";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

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

  const { engineers, callTypes, serviceCenters, projects, states } = useMasterStore();
  const role = useAuthStore((s) => s.user?.Role);
  const isPortal = role === "DEALER" || role === "CUSTOMER"; // dealers / customers book and track calls; staff assign and close

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  useUrlQuery("q", (q) => { setSearch(q); setStatusFilter(undefined); setPriorityFilter(undefined); setRange(null); setProjectFilter(undefined); });
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);

  // Drawer state for Log Complaint
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [editForm] = Form.useForm();
  const [deleting, setDeleting] = useState<Complaint | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [callTypeFilter, setCallTypeFilter] = useState<string>();
  const [centerFilter, setCenterFilter] = useState<string>();
  const [engineerFilter, setEngineerFilter] = useState<string>();
  const [warrantyFilter, setWarrantyFilter] = useState<string>();
  const [dueFilter, setDueFilter] = useState<string>();
  const [stateFilter, setStateFilter] = useState<string>();
  const [projectFilter, setProjectFilter] = useState<string>(); // project id, or "__none__" = calls without a project
  const [range, setRange] = useState<DateRange>(null); // call date
  const isOpen =(c: Complaint) => !["Resolved", "Closed", "Cancelled"].includes(c.Status);
  const overdue = (c: Complaint) => isOpen(c) && !!c.DueDate && new Date(c.DueDate) < new Date();
  const saveEdit = async () => {
    try { const values = await editForm.validateFields(); setSavingEdit(true); await axios.post("/api/service/complaints/update", { ...values, ComplaintId: editing?.ComplaintId, CallDate: values.CallDate?.toISOString() }); message.success("Service call updated"); setEditing(null); fetchComplaints(); }
    catch (error) { reportFormError(error, { form: editForm, fallback: "Could not update service call" }); }
    finally { setSavingEdit(false); }
  };
  const deleteCall = async () => {
    try { await axios.post("/api/service/complaints/delete", { ComplaintId: deleting?.ComplaintId }); message.success("Service call deleted"); setDeleting(null); fetchComplaints(); }
    catch (error) { reportFormError(error, { fallback: "Could not delete service call" }); }
  };

  // Assign Modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningComplaint, setAssigningComplaint] = useState<Complaint | null>(null);
  const [assigning, setAssigning] = useState(false);
  // Engineers offered in the assign dialog: those of the selected service center (the master list holds active engineers only).
  const assignCenter: string | undefined = Form.useWatch("serviceCenterId", assignForm);
  const assignEngineers = engineers.filter((e: any) => assignCenter && String(e.ServiceCenterId || "").toLowerCase() === String(assignCenter).toLowerCase());

  // Close Ticket Modal state
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingComplaint, setClosingComplaint] = useState<Complaint | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleOpenCreate = () => setDrawerOpen(true);

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
      title: "Call No",
      dataIndex: "ComplaintNo",
      key: "ComplaintNo",
      width: 140,
      render: (no: string) => (
        <span className="font-mono font-bold text-blue-700 tracking-tight">{no}</span>
      ),
    },
    {
      title: "Date",
      dataIndex: "CallDate",
      key: "CallDate",
      width: 110,
      render: (val: string) => formatDate(val, false),
    },
    {
      title: "Customer",
      key: "customer",
      render: (_: any, row: Complaint) => (
        <div>
          <div className="font-semibold text-slate-800">{row.CustomerName}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
            <PhoneOutlined className="text-slate-400" />
            <span className="font-mono">{row.Mobile}</span>
          </div>
          {row.District && <div className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">{row.District}</div>}
        </div>
      ),
    },
    {
      title: "Faulty components / issue",
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
          {(row.Components || row.PhotoCount || (row as any).VideoCount) ? (
            <div className="text-[11px] text-slate-500 mt-0.5">
              {row.Components && <span className="font-mono">{row.Components}</span>}
              {row.PhotoCount ? <span className="ml-1.5">· {row.PhotoCount} photo{row.PhotoCount > 1 ? "s" : ""}</span> : null}
              {(row as any).VideoCount ? <span className="ml-1.5">· {(row as any).VideoCount} video{(row as any).VideoCount > 1 ? "s" : ""}</span> : null}
            </div>
          ) : null}
          {row.WarrantyStatus && <Tag className="mt-1 text-[10px]" color={row.WarrantyStatus === "In Warranty" ? "green" : row.WarrantyStatus === "Partial" ? "orange" : "default"}>{row.WarrantyStatus}</Tag>}
        </div>
      ),
    },
    {
      title: "Project",
      key: "Project",
      width: 170,
      render: (_: any, row: Complaint) => {
        if (!row.ProjectId) return <span className="text-xs text-slate-300">—</span>;
        const p: any = projects.find((x: any) => String(x.ProjectId).toLowerCase() === String(row.ProjectId).toLowerCase());
        return (
          <div className="leading-tight">
            <div className="text-xs font-semibold text-slate-700 whitespace-normal break-words">{row.ProjectName || p?.ProjectName || "—"}</div>
            {p?.ProjectNo && <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.ProjectNo}</div>}
          </div>
        );
      },
    },
    {
      title: "Due",
      dataIndex: "DueDate",
      width: 115,
      render: (date: string, row: Complaint) => <span className={overdue(row) ? "font-semibold text-rose-600" : "text-slate-600"}>{date ? formatDate(date, false) : "—"}</span>,
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
      width: 130,
      render: (_: any, row: Complaint) => (
        <Space size="small">
          <Tooltip title="View call, components & photos">
            <Button type="text" size="small" icon={<EyeOutlined className="text-blue-600" />} onClick={() => setViewId(row.ComplaintId)} />
          </Tooltip>
          {!isPortal && <Tooltip title="Edit service call"><Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); editForm.setFieldsValue({ ...row, CallDate: dayjs(row.CallDate) }); }} /></Tooltip>}
          {!isPortal && <Tooltip title="Delete service call"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(row)} /></Tooltip>}
          {row.Status !== "Closed" && !isPortal && (
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

          {row.Status !== "Closed" && !isPortal && (
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

  // Project / scheme: ids compared case-insensitively (SQL Server GUIDs); "__none__" picks calls without a project.
  const matchProject = (c: Complaint) => !projectFilter
    || (projectFilter === "__none__" ? !c.ProjectId : String(c.ProjectId || "").toLowerCase() === projectFilter.toLowerCase());
  const projectLabel = (id?: string) => {
    if (!id) return null;
    if (id === "__none__") return "No project";
    const p: any = projects.find((x: any) => String(x.ProjectId).toLowerCase() === id.toLowerCase());
    return p ? `${p.ProjectNo ? `${p.ProjectNo} — ` : ""}${p.ProjectName}` : null;
  };
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
    const matchDue = !dueFilter || (dueFilter === "overdue" ? overdue(c) : !overdue(c));
    return matchSearch && matchStatus && matchPriority && matchDue && (!callTypeFilter || c.CallTypeId === callTypeFilter) && (!centerFilter || c.ServiceCenterId === centerFilter) && (!engineerFilter || c.EngineerUserId === engineerFilter) && (!warrantyFilter || c.WarrantyStatus === warrantyFilter) && (!stateFilter || c.StateId === stateFilter) && matchProject(c) && inDateRange(c.CallDate, range);
  });

  const exportExcel = () => exportTable("Service Calls", [
    { header: "Call No", value: (c: Complaint) => c.ComplaintNo },
    { header: "Date", value: (c: Complaint) => c.CallDate, type: "date" },
    { header: "Customer", value: (c: Complaint) => c.CustomerName },
    { header: "Mobile", value: (c: Complaint) => c.Mobile },
    { header: "Village", value: (c: Complaint) => c.Village },
    { header: "District", value: (c: Complaint) => c.District },
    { header: "Faulty components / issue", value: (c: Complaint) => c.ComplaintText },
    { header: "Call Type", value: (c: Complaint) => c.CallTypeName },
    { header: "Project", value: (c: Complaint) => c.ProjectName || (c.ProjectId ? projectLabel(c.ProjectId) : "") },
    { header: "Components", value: (c: Complaint) => c.Components },
    { header: "Photos", value: (c: Complaint) => c.PhotoCount || null, type: "number" },
    { header: "Videos", value: (c: Complaint) => (c as any).VideoCount || null, type: "number" },
    { header: "Warranty", value: (c: Complaint) => c.WarrantyStatus },
    { header: "Due", value: (c: Complaint) => c.DueDate, type: "date" },
    { header: "Overdue", value: (c: Complaint) => (overdue(c) ? "Yes" : "") },
    { header: "Priority", value: (c: Complaint) => c.Priority },
    { header: "Status", value: (c: Complaint) => c.Status },
    { header: "Assigned To", value: (c: Complaint) => c.EngineerName || "Unassigned" },
    { header: "Service Center", value: (c: Complaint) => c.ServiceCenterName },
  ], filtered, {
    "Call date": rangeLabel(range),
    Status: statusFilter,
    "Call type": callTypes.find((t: any) => t.CallTypeId === callTypeFilter)?.CallTypeName,
    Project: projectLabel(projectFilter),
    Warranty: warrantyFilter,
    Due: dueFilter === "overdue" ? "Overdue" : dueFilter === "current" ? "Not overdue" : null,
    State: states.find((s: any) => s.StateId === stateFilter)?.StateName,
    "Service center": serviceCenters.find((s: any) => s.ServiceCenterId === centerFilter)?.ServiceCenterName,
    Engineer: (() => { const e: any = engineers.find((x: any) => x.UserId === engineerFilter); return e ? `${e.FirstName} ${e.LastName || ""}`.trim() : null; })(),
    Priority: priorityFilter,
    Search: search || null,
  }, "Service Calls");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CustomerServiceOutlined className="text-blue-600" />
            Service Calls
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {complaints.length} calls · {complaints.filter(isOpen).length} open · <span className="text-rose-600">{complaints.filter(overdue).length} overdue</span>
          </p>
        </div>

        <div className="page-actions">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchComplaints()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <ExportExcelButton onExport={exportExcel} disabled={!filtered.length} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            className="bg-blue-600 shadow-sm"
          >
            New Service Call
          </Button>
        </div>
      </div>

      {(() => {
        const total = complaints.length || 0;
        const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}% of all calls` : "no calls yet");
        const unassigned = complaints.filter(c => c.Status === "New" || (isOpen(c) && !c.EngineerUserId)).length;
        const assigned = complaints.filter(c => c.Status === "Assigned").length;
        const inWork = complaints.filter(c => ["Visited", "In Approval"].includes(c.Status)).length;
        const late = complaints.filter(overdue).length;
        const done = complaints.filter(c => ["Resolved", "Closed"].includes(c.Status)).length;
        const month = complaints.filter(c => dayjs(c.CallDate).isSame(dayjs(), "month")).length;
        return <StatStrip items={[
          { label: "New / unassigned", value: unassigned, sub: "waiting for an engineer", accent: "#2563eb" },
          { label: "Assigned", value: assigned, sub: pct(assigned), accent: "#7c3aed" },
          { label: "Visited / in approval", value: inWork, sub: "engineer has visited", accent: "#0891b2" },
          { label: "Overdue", value: late, sub: "past the due date", tone: "danger" },
          { label: "Resolved / closed", value: done, sub: pct(done), tone: "ok" },
          { label: "This month", value: month, sub: dayjs().format("MMMM YYYY"), accent: "#0d9488" },
        ]} />;
      })()}
      {/* Filters: search, call date and status always shown; the rest under "More Filters" */}
      <FilterBar
        storageKey="service-calls"
        search={{ value: search, onChange: setSearch, placeholder: "Call no, customer, mobile, village…" }}
        filters={[
          { key: "date", label: "Call date", icon: <CalendarOutlined />, pinned: true, active: !!(range?.[0] || range?.[1]), onClear: () => setRange(null),
            render: () => <DateRangeFilter variant="borderless" value={range} onChange={setRange} placeholder={["From", "To"]} className="" /> },
          { key: "status", label: "Status", icon: <CheckCircleOutlined />, pinned: true, active: !!statusFilter, onClear: () => setStatusFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={statusFilter} onChange={setStatusFilter} popupMatchSelectWidth={false}
              options={["New", "Assigned", "Visited", "In Approval", "Approved", "Resolved", "Closed", "Cancelled"].map((s) => ({ value: s, label: s }))} /> },
          { key: "callType", label: "Call type", group: "Call details", icon: <TagsOutlined />, active: !!callTypeFilter, onClear: () => setCallTypeFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={callTypeFilter} onChange={setCallTypeFilter} popupMatchSelectWidth={false} options={callTypes.map((t: any) => ({ value: t.CallTypeId, label: t.CallTypeName }))} /> },
          { key: "project", label: "Project", group: "Call details", icon: <ProjectOutlined />, active: !!projectFilter, onClear: () => setProjectFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={projectFilter} onChange={setProjectFilter} popupMatchSelectWidth={false}
              options={[{ value: "__none__", label: "No project" }, ...projects.map((p: any) => ({ value: p.ProjectId, label: `${p.ProjectNo ? `${p.ProjectNo} — ` : ""}${p.ProjectName}` }))]} /> },
          { key: "priority", label: "Priority", group: "Call details", icon: <FlagOutlined />, active: !!priorityFilter, onClear: () => setPriorityFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={priorityFilter} onChange={setPriorityFilter} popupMatchSelectWidth={false} options={["High", "Urgent", "Medium", "Low"].map((p) => ({ value: p, label: p }))} /> },
          { key: "warranty", label: "Warranty", group: "Call details", icon: <SafetyOutlined />, active: !!warrantyFilter, onClear: () => setWarrantyFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={warrantyFilter} onChange={setWarrantyFilter} popupMatchSelectWidth={false} options={Array.from(new Set(complaints.map(c => c.WarrantyStatus).filter(Boolean))).map(v => ({ value: v, label: v }))} /> },
          { key: "due", label: "Due", group: "Status & dates", icon: <AlertOutlined />, active: !!dueFilter, onClear: () => setDueFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={dueFilter} onChange={setDueFilter} popupMatchSelectWidth={false} options={[{ value: "overdue", label: "Overdue" }, { value: "current", label: "Not overdue" }]} /> },
          { key: "state", label: "State", group: "Location & team", icon: <EnvironmentOutlined />, active: !!stateFilter, onClear: () => setStateFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={stateFilter} onChange={setStateFilter} popupMatchSelectWidth={false} options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} /> },
          { key: "center", label: "Service center", group: "Location & team", icon: <ShopOutlined />, active: !!centerFilter, onClear: () => setCenterFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={centerFilter} onChange={setCenterFilter} popupMatchSelectWidth={false} options={serviceCenters.map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))} /> },
          { key: "engineer", label: "Engineer", group: "Location & team", icon: <UserOutlined />, active: !!engineerFilter, onClear: () => setEngineerFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={engineerFilter} onChange={setEngineerFilter} popupMatchSelectWidth={false} options={engineers.map((e: any) => ({ value: e.UserId, label: `${e.FirstName} ${e.LastName || ""}`.trim() }))} /> },
        ]}
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="ComplaintId"
          size="middle"
          loading={isLoading}
          pagination={{
            defaultPageSize: 15,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "20", "50", "100"],
            showTotal: (total, range) => `Showing ${range[0]}-${range[1]} of ${total} complaints`,
          }}
          rowClassName={(row: Complaint) => overdue(row) ? "border-l-2 border-rose-500" : ""}
          scroll={{ x: 1620 }}
        />
      </div>

      {/* New service call (prototype form: call details, customer & site, components, photos, assignment) */}
      <ServiceCallDetailDrawer complaintId={viewId} onClose={() => setViewId(null)} />
      <ServiceCallFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSaved={() => { setDrawerOpen(false); fetchComplaints(); }} />
      <ServiceCallFormDrawer key={editing?.ComplaintId || "edit"} open={!!editing} complaintId={editing?.ComplaintId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchComplaints(); }} />
      <Modal title="Delete service call?" open={!!deleting} onCancel={() => setDeleting(null)} onOk={deleteCall} okButtonProps={{ danger: true }} okText="Delete call"><p>Delete {deleting?.ComplaintNo}? This removes its components, reminders, and attachments. Calls with visits, job cards, or replacements cannot be deleted.</p></Modal>

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
            <Select placeholder="Select regional center" onChange={(sc) => {
              // Keep the engineer only if they belong to the newly picked center.
              const current = engineers.find((e: any) => e.UserId === assignForm.getFieldValue("engineerUserId"));
              if (current && sc && String(current.ServiceCenterId || "").toLowerCase() !== String(sc).toLowerCase()) assignForm.setFieldValue("engineerUserId", undefined);
            }}>
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
            <Select showSearch optionFilterProp="label" placeholder={assignCenter ? "Select engineer" : "Select the service center first"} disabled={!assignCenter}
              notFoundContent="No engineers in this service center — add one in Configuration → Service Engineers"
              options={assignEngineers.map((e: any) => ({ value: e.UserId, label: `${e.FirstName} ${e.LastName || ""}`.trim() }))} />
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
