"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Tooltip,
  Switch,
  message,
  Avatar,
  Popconfirm,
  Badge,
  Divider,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import { useUserStore, AppUser, UserRole } from "@/lib/store/useUserStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import {
  DrawerHeader,
  DrawerChip,
  DRAWER_WIDTH,
  DRAWER_HEADER_STYLE,
} from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { reportFormError } from "@/lib/utils/formErrors";
import { formatDate } from "@/lib/utils/dateFormat";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { ALL_FORMS, FORM_GROUPS, defaultFormsForRole, parseList } from "@/lib/auth/forms";

/** Number of screens a FormRights list opens (module keys from older saves count as all their screens). */
const countScreens = (rights: string[]) => new Set(rights.flatMap((r) => FORM_GROUPS.find((g) => g.key === r)?.forms.map((f) => f.key) || [r])).size;
import { FormRightsPicker } from "@/components/admin/FormRightsPicker";
import { districtOptions } from "@/lib/utils/selectOptions";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useCustomerStore } from "@/lib/store/useCustomerStore";

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: "SUPER", label: "Super Admin", color: "red" },
  { value: "HO", label: "Head Office", color: "purple" },
  { value: "MANAGER", label: "Manager", color: "blue" },
  { value: "ENGINEER", label: "Field Engineer", color: "cyan" },
  { value: "SERVICE_CENTER", label: "Service Center", color: "geekblue" },
  { value: "WAREHOUSE", label: "Warehouse", color: "gold" },
  { value: "DEALER", label: "Dealer", color: "orange" },
  { value: "CUSTOMER", label: "Customer", color: "green" },
];

function getRoleConfig(role: string) {
  return (
    ROLE_OPTIONS.find((r) => r.value === role) || { label: role, color: "default" }
  );
}

function getInitials(first: string, last?: string | null) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "U";
}

const AVATAR_COLORS: Record<string, string> = {
  SUPER: "#ef4444",
  HO: "#8b5cf6",
  MANAGER: "#3b82f6",
  ENGINEER: "#06b6d4",
  SERVICE_CENTER: "#1d4ed8",
  WAREHOUSE: "#ca8a04",
  DEALER: "#f97316",
  CUSTOMER: "#22c55e",
};

export default function UsersPage() {
  const [form] = Form.useForm();
  const { users, fetchUsers, addUser, updateUser, deleteUser, isLoading } = useUserStore();
  const { user: currentUser } = useAuthStore();
  const { states, districts, serviceCenters } = useMasterStore();
  const watchedRole = Form.useWatch("Role", form);
  const watchedAdmin = Form.useWatch("IsAdmin", form);
  const watchedStates: string[] = Form.useWatch("StateRights", form) || [];
  const rightsUnrestricted = Boolean(watchedAdmin) || watchedRole === "SUPER";
  const isPortalRole = watchedRole === "DEALER" || watchedRole === "CUSTOMER";
  const { dealers, fetchDealers } = useWarrantyStore();
  const { customers, fetchCustomers } = useCustomerStore();
  useEffect(() => {
    if (watchedRole === "DEALER" && !dealers.length) fetchDealers().catch(() => undefined);
    if (watchedRole === "CUSTOMER" && !customers.length) fetchCustomers().catch(() => undefined);
  }, [watchedRole]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Portal logins are linked by user name: dealer code (or dealer mobile) / customer mobile — same rule the server uses. */
  const getLinkedRecord = () => {
    const name = String(editingUser?.Username || "").toLowerCase();
    if (!editingUser || !name) return null;
    if (watchedRole === "DEALER") { const d = dealers.find((x) => String(x.DealerCode || "").toLowerCase() === name || x.Mobile === name); return d ? `${d.FirmName}${d.DealerCode ? ` (dealer code ${d.DealerCode})` : ""}` : null; }
    const c = customers.find((x) => x.Mobile === name); return c ? `${c.CustomerName} · ${c.Mobile}` : null;
  };

  const linkRecord = (id?: string) => {
    if (!id) return;
    if (watchedRole === "DEALER") {
      const d = dealers.find((x) => x.DealerId === id); if (!d) return;
      const code = String(d.DealerCode || "").toLowerCase();
      form.setFieldsValue({ Username: /^[a-z0-9._-]{3,}$/.test(code) ? code : d.Mobile, FirstName: d.ContactPerson || d.FirmName, LastName: d.ContactPerson ? d.FirmName : undefined, Phone: d.Mobile, Email: d.Email || undefined });
    } else {
      const c = customers.find((x) => x.CustomerId === id); if (!c) return;
      form.setFieldsValue({ Username: c.Mobile, FirstName: c.CustomerName, LastName: undefined, Phone: c.Mobile, Email: c.Email || undefined });
    }
  };

  /** Rights fields → API payload; empty lists mean "all". */
  const rightsFrom = (values: any) => ({
    Address: values.Address || null,
    ServiceCenterId: values.ServiceCenterId || null,
    StateRights: values.StateRights || [],
    DistrictRights: values.DistrictRights || [],
    FormRights: values.FormRights || [],
  });

  const [search, setSearch] = useState("");
  const searchParams = useSearchParams();
  const [roleFilter, setRoleFilter] = useState<string | undefined>(searchParams.get("role") || undefined);
  useEffect(() => { setRoleFilter(searchParams.get("role") || undefined); }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [changePassword, setChangePassword] = useState(false);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Client-side filter
  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.Username.toLowerCase().includes(q) ||
          u.FirstName.toLowerCase().includes(q) ||
          (u.LastName || "").toLowerCase().includes(q) ||
          (u.Email || "").toLowerCase().includes(q)
      );
    }
    if (roleFilter) {
      list = list.filter((u) => u.Role === roleFilter);
    }
    if (statusFilter !== undefined) {
      list = list.filter((u) => u.IsActive === statusFilter);
    }
    return list;
  }, [users, search, roleFilter, statusFilter]);

  function openAddDrawer() {
    setEditingUser(null);
    setChangePassword(false);
    form.resetFields();
    const initialRole = roleFilter === "ENGINEER" ? "ENGINEER" : "MANAGER";
    form.setFieldsValue({ IsActive: true, IsAdmin: false, Role: initialRole, StateRights: [], DistrictRights: [], FormRights: defaultFormsForRole(initialRole) });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: AppUser) {
    setEditingUser(record);
    setChangePassword(false);
    form.setFieldsValue({
      FirstName: record.FirstName,
      LastName: record.LastName || "",
      Email: record.Email || "",
      Phone: record.Phone || "",
      Address: record.Address || "",
      Role: record.Role,
      IsActive: record.IsActive,
      IsAdmin: record.IsAdmin,
      NewPassword: "",
      ServiceCenterId: record.ServiceCenterId || undefined,
      StateRights: parseList(record.StateRights).map((id) => states.find((s) => String(s.StateId).toLowerCase() === id.toLowerCase())?.StateId || id),
      DistrictRights: parseList(record.DistrictRights),
      FormRights: parseList(record.FormRights),
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingUser(null);
    setChangePassword(false);
    form.resetFields();
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingUser) {
        await updateUser({
          UserId: editingUser.UserId,
          FirstName: values.FirstName,
          LastName: values.LastName || undefined,
          Email: values.Email || undefined,
          Phone: values.Phone || undefined,
          Role: values.Role,
          IsActive: values.IsActive,
          IsAdmin: values.IsAdmin || false,
          Password: changePassword && values.NewPassword ? values.NewPassword : undefined,
          ...rightsFrom(values),
        });
        message.success("User updated successfully");
      } else {
        await addUser({
          Username: values.Username,
          Password: values.Password,
          FirstName: values.FirstName,
          LastName: values.LastName || undefined,
          Email: values.Email || undefined,
          Phone: values.Phone || undefined,
          Role: values.Role,
          IsActive: values.IsActive,
          IsAdmin: values.IsAdmin || false,
          ...rightsFrom(values),
        });
        message.success("User created successfully");
      }

      closeDrawer();
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Failed to save user" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;
    try {
      setDeleting(true);
      await deleteUser(deletingUser.UserId);
      message.success(`User "${deletingUser.Username}" deleted`);
      setDeleteModalOpen(false);
      setDeletingUser(null);
    } catch (err: any) {
      message.error(err.response?.data?.error || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  }

  const columns: ColumnsType<AppUser> = [
    {
      title: "User",
      key: "user",
      width: 240,
      render: (_, record) => {
        const roleConf = getRoleConfig(record.Role);
        return (
          <div className="flex items-center space-x-3">
            <Avatar
              size={38}
              style={{ backgroundColor: AVATAR_COLORS[record.Role] || "#6b7280", flexShrink: 0 }}
              className="font-bold text-sm"
            >
              {getInitials(record.FirstName, record.LastName)}
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 text-sm leading-tight truncate">
                {record.FirstName} {record.LastName || ""}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">@{record.Username}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: "Role",
      dataIndex: "Role",
      key: "Role",
      width: 140,
      render: (role, record) => {
        const conf = getRoleConfig(role);
        return (
          <div className="flex flex-col gap-1">
            <Tag color={conf.color} className="text-xs font-semibold w-fit">
              {conf.label}
            </Tag>
            {record.IsAdmin && (
              <Tag
                icon={<CrownOutlined />}
                color="gold"
                className="text-[11px] font-semibold w-fit"
              >
                Admin
              </Tag>
            )}
            {Boolean(record.IsErpUser) && (
              <Tooltip title="Administrator from Delta iERP — signs in with the iERP user name and password">
                <Tag color="geekblue" className="text-[11px] font-semibold w-fit">iERP</Tag>
              </Tooltip>
            )}
            {record.Role === "ENGINEER" && (record.LedgerCode
              ? <Tooltip title="iERP ledger (Service Engineers group)"><Tag color="geekblue" className="text-[11px] font-mono w-fit">{record.LedgerCode}</Tag></Tooltip>
              : <Tooltip title="Created in the iERP on the next save"><Tag color="warning" className="text-[11px] w-fit">Not in iERP</Tag></Tooltip>)}
          </div>
        );
      },
    },
    {
      title: "Contact",
      key: "contact",
      width: 200,
      render: (_, record) => (
        <div className="text-xs space-y-0.5">
          {record.Email && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <MailOutlined className="text-slate-400" />
              <span className="truncate max-w-[160px]">{record.Email}</span>
            </div>
          )}
          {record.Phone && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <PhoneOutlined className="text-slate-400" />
              {record.Phone}
            </div>
          )}
          {!record.Email && !record.Phone && (
            <span className="text-slate-400 italic">—</span>
          )}
        </div>
      ),
    },
    {
      title: "Access Rights",
      key: "rights",
      width: 230,
      render: (_, record) => {
        if (record.IsAdmin || record.Role === "SUPER") return <Tag color="gold" className="text-[11px]">Full access</Tag>;
        const stateIds = parseList(record.StateRights).map((s) => s.toLowerCase());
        const stateNames = states.filter((s) => stateIds.includes(String(s.StateId).toLowerCase())).map((s) => s.ShortName || s.StateName);
        const districts = parseList(record.DistrictRights);
        const forms = parseList(record.FormRights);
        return (
          <div className="text-xs space-y-0.5">
            {record.ServiceCenterName && <div className="text-slate-600"><span className="text-slate-400">Centre:</span> {record.ServiceCenterName}</div>}
            <div className="text-slate-600"><span className="text-slate-400">States:</span> {stateNames.length ? stateNames.join(", ") : "All"}{districts.length ? ` · ${districts.length} district${districts.length > 1 ? "s" : ""}` : ""}</div>
            <div className="text-slate-600"><span className="text-slate-400">Screens:</span> {forms.length ? `${countScreens(forms)} of ${ALL_FORMS.length}` : <span className="text-amber-600">None (dashboard only)</span>}</div>
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "IsActive",
      key: "IsActive",
      width: 100,
      align: "center",
      render: (active) =>
        active ? (
          <Tag icon={<CheckCircleFilled />} color="success" className="text-xs font-semibold">
            Active
          </Tag>
        ) : (
          <Tag icon={<CloseCircleFilled />} color="error" className="text-xs font-semibold">
            Inactive
          </Tag>
        ),
    },
    {
      title: "Last Login",
      dataIndex: "LastLogin",
      key: "LastLogin",
      width: 160,
      render: (val) =>
        val ? (
          <span className="text-xs text-slate-600">{formatDate(val, true)}</span>
        ) : (
          <span className="text-xs text-slate-400 italic">Never</span>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      align: "center",
      render: (_, record) => {
        const isSelf = record.UserId === currentUser?.UserId;
        return (
          <Space size={4}>
            <Tooltip title="Edit User">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                className="text-blue-600 hover:bg-blue-50"
                onClick={() => openEditDrawer(record)}
              />
            </Tooltip>
            <Tooltip title={isSelf ? "Cannot delete your own account" : "Delete User"}>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                className="text-red-500 hover:bg-red-50"
                disabled={isSelf}
                onClick={() => {
                  setDeletingUser(record);
                  setDeleteModalOpen(true);
                }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const totalActive = users.filter((u) => u.IsActive).length;
  const totalAdmin = users.filter((u) => u.IsAdmin).length;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="page-header">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <TeamOutlined className="text-base" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 leading-tight tracking-tight">
                  User Management
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage system users, roles and access permissions
                </p>
              </div>
            </div>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="h-9 px-5 font-semibold text-sm rounded-lg shadow-sm bg-blue-600 border-none"
            onClick={openAddDrawer}
          >
            Add User
          </Button>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3 max-w-sm">
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 text-center">
            <div className="text-2xl font-extrabold text-slate-900">{users.length}</div>
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Total</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 text-center">
            <div className="text-2xl font-extrabold text-emerald-600">{totalActive}</div>
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Active</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 text-center">
            <div className="text-2xl font-extrabold text-red-500">{totalAdmin}</div>
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Admins</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-toolbar mb-4">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by name, username, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="h-9 rounded-lg border-slate-200 text-sm max-w-xs"
        />
        <Select
          placeholder="All Roles"
          value={roleFilter}
          onChange={setRoleFilter}
          allowClear
          className="h-9 min-w-[140px] text-sm"
          options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        />
        <Select
          placeholder="All Status"
          value={statusFilter as any}
          onChange={(v) => setStatusFilter(v === undefined ? undefined : v === "active")}
          allowClear
          className="h-9 min-w-[130px] text-sm"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">
            {filteredUsers.length} of {users.length} users
          </span>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            className="text-slate-500 border-slate-200 rounded-lg h-8"
            onClick={() => fetchUsers()}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table
          rowKey="UserId"
          columns={columns}
          dataSource={filteredUsers}
          loading={isLoading}
          pagination={{
            defaultPageSize: 15,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "20", "50", "100"],
            showTotal: (total, range) => `Showing ${range[0]}-${range[1]} of ${total} users`,
            size: "small",
          }}
          scroll={{ x: 900 }}
          size="small"
          className="text-sm"
          rowClassName={(record) =>
            !record.IsActive ? "opacity-60" : ""
          }
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        width={maximized ? "100%" : "min(760px, 100vw)"}
        styles={{ header: DRAWER_HEADER_STYLE, body: { padding: 0 } }}
        closeIcon={null}
        title={
          <DrawerHeader
            icon={<UserOutlined className="text-white/90" />}
            title={editingUser ? "Edit User" : "Add New User"}
            subtitle={editingUser ? `@${editingUser.Username}` : "Create a system user account"}
            meta={
              editingUser ? (
                <DrawerChip label={getRoleConfig(editingUser.Role).label} tone="outline" />
              ) : undefined
            }
            maximized={maximized}
            onToggleMaximize={() => setMaximized((m) => !m)}
            onClose={closeDrawer}
          />
        }
        footer={
          <div className="flex justify-end gap-3 py-3 px-4 border-t border-slate-100">
            <Button onClick={closeDrawer} className="rounded-lg border-slate-300 text-sm">
              Cancel
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={handleSave}
              className="rounded-lg bg-blue-600 border-none font-semibold text-sm px-6"
            >
              {editingUser ? "Save Changes" : "Create User"}
            </Button>
          </div>
        }
      >
        <div className="p-5 sm:p-6">
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            className="space-y-0"
          >
            {/* Section: Account Info */}
            <div className="mb-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <UserOutlined />
                Account Information
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="FirstName"
                  label={<span className="text-xs font-semibold text-slate-700">First Name *</span>}
                  rules={[{ required: true, message: "First name is required" }]}
                  className="!mb-0"
                >
                  <Input
                    placeholder="e.g. Rajesh"
                    className="h-9 rounded-lg border-slate-300 text-sm"
                  />
                </Form.Item>
                <Form.Item
                  name="LastName"
                  label={<span className="text-xs font-semibold text-slate-700">Last Name</span>}
                  className="!mb-0"
                >
                  <Input
                    placeholder="e.g. Kumar"
                    className="h-9 rounded-lg border-slate-300 text-sm"
                  />
                </Form.Item>
              </div>
            </div>

            {/* Username — only for new users */}
            {!editingUser && (
              <Form.Item
                name="Username"
                label={<span className="text-xs font-semibold text-slate-700">Username *</span>}
                rules={[
                  { required: true, message: "Username is required" },
                  { min: 3, message: "At least 3 characters" },
                  {
                    pattern: /^[a-z0-9._-]+$/,
                    message: "Lowercase letters, numbers, dots, underscores, hyphens only",
                  },
                ]}
                extra={<span className="text-[11px] text-slate-400">Must be unique. Use lowercase only.</span>}
                className="!mb-4"
              >
                <Input
                  prefix={<span className="text-slate-400 text-sm">@</span>}
                  placeholder="e.g. rajesh.kumar"
                  className="h-9 rounded-lg border-slate-300 text-sm"
                />
              </Form.Item>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <Form.Item
                name="Email"
                label={<span className="text-xs font-semibold text-slate-700">Email</span>}
                rules={[{ type: "email", message: "Enter a valid email" }]}
                className="!mb-0"
              >
                <Input
                  prefix={<MailOutlined className="text-slate-400 text-xs" />}
                  placeholder="email@company.com"
                  className="h-9 rounded-lg border-slate-300 text-sm"
                />
              </Form.Item>
              <Form.Item
                name="Phone"
                label={<span className="text-xs font-semibold text-slate-700">Phone</span>}
                className="!mb-0"
              >
                <Input
                  prefix={<PhoneOutlined className="text-slate-400 text-xs" />}
                  placeholder="10-digit mobile"
                  className="h-9 rounded-lg border-slate-300 text-sm"
                />
              </Form.Item>
            </div>
            <Form.Item
              name="Address"
              label={<span className="text-xs font-semibold text-slate-700">Address</span>}
              extra={watchedRole === "ENGINEER" ? <span className="text-[11px]">Engineers are also saved as an iERP ledger (Service Engineers group) with this address.</span> : undefined}
              rules={[{ max: 255 }]}
              className="!mb-0 !mt-3"
            >
              <Input.TextArea rows={2} maxLength={255} className="rounded-lg border-slate-300 text-sm" />
            </Form.Item>

            <Divider className="!my-4" />

            {/* Section: Role & Access */}
            <div className="mb-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <SafetyCertificateOutlined />
                Role & Access
              </div>
              <Form.Item
                name="Role"
                label={<span className="text-xs font-semibold text-slate-700">System Role *</span>}
                rules={[{ required: true, message: "Please select a role" }]}
                className="!mb-3"
              >
                <Select
                  placeholder="Select role"
                  className="h-9 text-sm"
                  onChange={(role: string) => {
                    // New users start with the screens suggested for the role; existing users keep their selection.
                    if (!editingUser) form.setFieldValue("FormRights", defaultFormsForRole(role));
                  }}
                  options={ROLE_OPTIONS.map((r) => ({
                    value: r.value,
                    label: (
                      <div className="flex items-center gap-2">
                        <Tag color={r.color} className="text-[11px] m-0">{r.label}</Tag>
                      </div>
                    ),
                  }))}
                />
              </Form.Item>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                <div>
                  <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <CrownOutlined className="text-amber-500" />
                    Administrator Access
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Full system access including user management
                  </div>
                </div>
                <Form.Item name="IsAdmin" valuePropName="checked" className="!mb-0">
                  <Switch size="small" />
                </Form.Item>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200 mt-2">
                <div>
                  <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <CheckCircleFilled className="text-emerald-500" />
                    Active Account
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Inactive users cannot log in
                  </div>
                </div>
                <Form.Item name="IsActive" valuePropName="checked" className="!mb-0">
                  <Switch size="small" defaultChecked />
                </Form.Item>
              </div>
            </div>

            <Divider className="!my-4" />

            {/* Section: Access Rights */}
            <div className="mb-4">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <SafetyCertificateOutlined />
                Access Rights
              </div>
              {rightsUnrestricted && (
                <Alert type="success" showIcon className="!mb-3 text-xs" message="Super Admin and administrator accounts see all states and every screen. The rights below are kept but not applied." />
              )}
              {isPortalRole && !rightsUnrestricted && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 mb-3">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">{watchedRole === "DEALER" ? "Linked Dealer" : "Linked Customer"}</div>
                  {editingUser ? (
                    <p className={`text-xs ${getLinkedRecord() ? "text-slate-700" : "text-red-600"}`}>{getLinkedRecord() || "Not linked — no " + (watchedRole === "DEALER" ? "dealer code or mobile" : "customer mobile") + " matches this user name, so the login sees nothing."}</p>
                  ) : (
                    <Select showSearch allowClear optionFilterProp="label" className="w-full" placeholder={watchedRole === "DEALER" ? "Select the dealer this login belongs to" : "Select the customer this login belongs to"}
                      options={watchedRole === "DEALER"
                        ? dealers.map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""} · ${d.Mobile}` }))
                        : customers.map((c) => ({ value: c.CustomerId, label: `${c.CustomerName} · ${c.Mobile}${c.Village ? ` · ${c.Village}` : ""}` }))}
                      onChange={(id: string) => linkRecord(id)} />
                  )}
                  <p className="text-[11px] text-slate-500 mt-1.5">The login sees only {watchedRole === "DEALER" ? "this dealer's" : "this customer's"} own pumps, warranties and service calls. It is linked by user name = {watchedRole === "DEALER" ? "dealer code (or dealer mobile)" : "registered mobile number"}; choosing a record fills the user name, name and mobile.</p>
                </div>
              )}
              <Form.Item
                name="ServiceCenterId"
                label={<span className="text-xs font-semibold text-slate-700">Service Center</span>}
                extra={<span className="text-[11px]">Managers see calls of this centre; engineers' van stock belongs to it.</span>}
                rules={[{ required: watchedRole === "MANAGER" || watchedRole === "ENGINEER" || watchedRole === "SERVICE_CENTER", message: "Service center is required for managers, engineers and service center logins" }]}
                className="!mb-3"
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="Select service center" options={serviceCenters.map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))} />
              </Form.Item>
              <Form.Item
                name="StateRights"
                label={<span className="text-xs font-semibold text-slate-700">State Rights</span>}
                extra={<span className="text-[11px]">Blank = all states. Calls, installations, warranties, customers and dealers are limited to the ticked states.</span>}
                className="!mb-3"
              >
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="All states" maxTagCount="responsive"
                  options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))}
                  onChange={(ids: string[]) => {
                    // Drop districts that no longer belong to a selected state.
                    const allowed = new Set(districtOptions(districts, ids).map((o) => o.value.toLowerCase()));
                    form.setFieldValue("DistrictRights", ids.length ? (form.getFieldValue("DistrictRights") || []).filter((d: string) => allowed.has(d.toLowerCase())) : form.getFieldValue("DistrictRights"));
                  }} />
              </Form.Item>
              <Form.Item
                name="DistrictRights"
                label={<span className="text-xs font-semibold text-slate-700">District Rights (optional)</span>}
                extra={<span className="text-[11px]">Blank = every district of the selected states.</span>}
                className="!mb-3"
              >
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={watchedStates.length ? "All districts of the selected states" : "Select states first to narrow the list"} maxTagCount="responsive"
                  options={districtOptions(districts, watchedStates)} />
              </Form.Item>
              <Form.Item
                name="FormRights"
                label={<span className="text-xs font-semibold text-slate-700">Screen (Form) Rights</span>}
                extra={<span className="text-[11px]">Only the ticked screens appear in this user's menu and can be opened. The dashboard is always visible.</span>}
                rules={[{
                  validator: (_, value?: string[]) => rightsUnrestricted || (value && value.length)
                    ? Promise.resolve()
                    : Promise.reject(new Error("Tick at least one screen this user can open")),
                }]}
                className="!mb-0"
              >
                <FormRightsPicker role={watchedRole} unrestricted={rightsUnrestricted} />
              </Form.Item>
            </div>

            <Divider className="!my-4" />

            {/* Section: Password */}
            <div className="mb-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <LockOutlined />
                {editingUser ? "Change Password (Optional)" : "Set Password"}
              </div>
              {Boolean(editingUser?.IsErpUser) && (
                <Alert type="info" showIcon className="!mb-3 text-xs" message="This administrator signs in with their Delta iERP password. Change it in the iERP — a password set here is ignored." />
              )}

              {editingUser ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Switch
                      size="small"
                      checked={changePassword}
                      onChange={setChangePassword}
                    />
                    <span className="text-sm text-slate-600 font-medium">
                      Set a new password for this user
                    </span>
                  </div>
                  {changePassword && (
                    <Form.Item
                      name="NewPassword"
                      rules={[
                        { required: changePassword, message: "Enter a new password" },
                        { min: 6, message: "Minimum 6 characters" },
                      ]}
                      className="!mb-0"
                    >
                      <Input.Password
                        prefix={<LockOutlined className="text-slate-400 text-xs" />}
                        placeholder="New password"
                        className="h-9 rounded-lg border-slate-300 text-sm"
                      />
                    </Form.Item>
                  )}
                </>
              ) : (
                <>
                  <Form.Item
                    name="Password"
                    rules={[
                      { required: true, message: "Password is required" },
                      { min: 6, message: "Minimum 6 characters" },
                    ]}
                    className="!mb-3"
                  >
                    <Input.Password
                      prefix={<LockOutlined className="text-slate-400 text-xs" />}
                      placeholder="Create a strong password"
                      className="h-9 rounded-lg border-slate-300 text-sm"
                    />
                  </Form.Item>
                  <Alert
                    type="info"
                    showIcon={false}
                    className="rounded-lg text-xs border-blue-200 bg-blue-50 text-blue-700 py-2 px-3"
                    message="Password must be at least 6 characters. The user can change it after first login."
                  />
                </>
              )}
            </div>
          </Form>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete User"
        description={
          deletingUser
            ? `Are you sure you want to delete user "@${deletingUser.Username}" (${deletingUser.FirstName} ${deletingUser.LastName || ""})? This action cannot be undone.`
            : ""
        }
        okText="Delete User"
        isDanger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeletingUser(null);
        }}
      />
    </div>
  );
}
