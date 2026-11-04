"use client";

import React, { useState, useEffect } from "react";
import {
  Layout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Tag,
  Space,
  Spin,
  Drawer,
  Grid,
} from "antd";
import {
  DashboardOutlined,
  BarcodeOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShopOutlined,
  CustomerServiceOutlined,
  AppstoreOutlined,
  BankOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusCircleOutlined,
  TeamOutlined,
  BellOutlined,
  DownOutlined,
  CarOutlined,
  ToolOutlined,
  AuditOutlined,
  SwapOutlined,
  BarChartOutlined,
  InboxOutlined,
  DatabaseOutlined,
  SettingOutlined,
  FileSearchOutlined,
  ExperimentOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  RollbackOutlined,
  ExportOutlined,
  GlobalOutlined,
  HistoryOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { canUseForm, formForPath, parseList, type RoleCode } from "@/lib/auth/forms";
import { PageLoader } from "@/components/common/Loader";

const { Header, Sider, Content } = Layout;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, isMobile]);

  const { user, fetchCurrentUser, logout, isAuthenticated } = useAuthStore();
  const { fetchBootstrap, company, states } = useMasterStore();

  useEffect(() => {
    setMounted(true);
    fetchCurrentUser();
    fetchBootstrap();
  }, [fetchCurrentUser, fetchBootstrap]);

  const menuItems = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: <Link href="/">{user?.Role === "CUSTOMER" && !user?.IsAdmin ? "My Products" : "Dashboard"}</Link>,
    },
    {
      key: "sub-warranty",
      icon: <SafetyCertificateOutlined />,
      label: "Warranty System",
      children: [
        {
          key: "/warranty/stickers",
          icon: <BarcodeOutlined />,
          label: <Link href="/warranty/stickers">Serial Register</Link>,
        },
        {
          key: "/warranty/register",
          icon: <PlusCircleOutlined />,
          label: <Link href="/warranty/register">Register Warranty</Link>,
        },
        {
          key: "/warranty/active",
          icon: <SafetyCertificateOutlined />,
          label: <Link href="/warranty/active">Active Warranties</Link>,
        },
        {
          key: "/warranty/replace",
          icon: <SwapOutlined />,
          label: <Link href="/warranty/replace">Replacement Flow (In Warranty)</Link>,
        },
        {
          key: "/warranty/search",
          icon: <FileSearchOutlined />,
          label: <Link href="/warranty/search">Serial No. Search Report</Link>,
        },
        {
          key: "/warranty/verify",
          icon: <SearchOutlined />,
          label: <Link href="/warranty/verify">Serial Verification</Link>,
        },
        {
          key: "/warranty/dealers",
          icon: <ShopOutlined />,
          label: <Link href="/warranty/dealers">Dealers Master</Link>,
        },
        {
          key: "/warranty/customers",
          icon: <TeamOutlined />,
          label: <Link href="/warranty/customers">Customers</Link>,
        },
        {
          key: "/warranty/geo",
          icon: <GlobalOutlined />,
          label: <Link href="/warranty/geo">Geo-Graphical Report</Link>,
        },
      ],
    },
    {
      key: "sub-service",
      icon: <CustomerServiceOutlined />,
      label: "Service Management",
      children: [
        {
          key: "/service/dashboard",
          icon: <DashboardOutlined />,
          label: <Link href="/service/dashboard">Service Dashboard</Link>,
        },
        {
          key: "/service/complaints",
          icon: <CustomerServiceOutlined />,
          label: <Link href="/service/complaints">Service Call</Link>,
        },
        {
          key: "/service/reminders",
          icon: <BellOutlined />,
          label: <Link href="/service/reminders">Call Reminders</Link>,
        },
        {
          key: "/service/visits",
          icon: <CarOutlined />,
          label: <Link href="/service/visits">Visit Reports</Link>,
        },
        {
          key: "/service/jobcards",
          icon: <ToolOutlined />,
          label: <Link href="/service/jobcards">Job Cards (Estimate)</Link>,
        },
        {
          key: "/service/approvals",
          icon: <AuditOutlined />,
          label: <Link href="/service/approvals">Job Card Approvals</Link>,
        },
        {
          key: "/service/replacements",
          icon: <SwapOutlined />,
          label: <Link href="/service/replacements">Replacement / Return</Link>,
        },
        {
          key: "/service/reports",
          icon: <BarChartOutlined />,
          label: <Link href="/service/reports">Service Reports</Link>,
        },
      ],
    },
    {
      key: "sub-stock",
      icon: <InboxOutlined />,
      label: "Spares Stock",
      children: [
        {
          key: "/stock/availability",
          icon: <InboxOutlined />,
          label: <Link href="/stock/availability">Stock Availability</Link>,
        },
        {
          key: "/stock/engineer",
          icon: <TeamOutlined />,
          label: <Link href="/stock/engineer">Engineer-wise Stock</Link>,
        },
        {
          key: "/stock/ledger",
          icon: <DatabaseOutlined />,
          label: <Link href="/stock/ledger">Stock Ledger & Entry</Link>,
        },
        {
          key: "/stock/warehouse-stock",
          icon: <DatabaseOutlined />,
          label: <Link href="/stock/warehouse-stock">Warehouse Stock</Link>,
        },
        {
          key: "/stock/consumption",
          icon: <ExperimentOutlined />,
          label: <Link href="/stock/consumption">Parts Consumption</Link>,
        },
        {
          key: "/stock/material-requests",
          icon: <ShoppingCartOutlined />,
          label: <Link href="/stock/material-requests">Material Request</Link>,
        },
        {
          key: "/stock/material-approvals",
          icon: <AuditOutlined />,
          label: <Link href="/stock/material-approvals">Material Approvals</Link>,
        },
        {
          key: "/stock/challans",
          icon: <FileTextOutlined />,
          label: <Link href="/stock/challans">Delivery Challan</Link>,
        },
        {
          key: "/stock/grn",
          icon: <InboxOutlined />,
          label: <Link href="/stock/grn">Goods Receipt (GRN)</Link>,
        },
        {
          key: "/stock/dcreturn",
          icon: <SwapOutlined />,
          label: <Link href="/stock/dcreturn">Defective / Fresh Receipt</Link>,
        },
        {
          key: "/stock/material-issues",
          icon: <ExportOutlined />,
          label: <Link href="/stock/material-issues">Material Issue</Link>,
        },
        {
          key: "/stock/returnable-pending",
          icon: <RollbackOutlined />,
          label: <Link href="/stock/returnable-pending">Pending Returnable</Link>,
        },
        {
          key: "/stock/material-reports",
          icon: <BarChartOutlined />,
          label: <Link href="/stock/material-reports">Material & Challan Reports</Link>,
        },
      ],
    },
    {
      key: "sub-masters",
      icon: <AppstoreOutlined />,
      label: "Configuration",
      children: [
        {
          key: "/masters/company",
          icon: <BankOutlined />,
          label: <Link href="/masters/company">Company Profile</Link>,
        },
        {
          key: "/admin/users",
          icon: <TeamOutlined />,
          label: <Link href="/admin/users">User Management</Link>,
        },
        {
          key: "/masters/service-centers",
          icon: <ShopOutlined />,
          label: <Link href="/masters/service-centers">Service Centers / Warehouses</Link>,
        },
        {
          key: "/masters/service-engineers",
          icon: <IdcardOutlined />,
          label: <Link href="/masters/service-engineers">Service Engineers</Link>,
        },
        ...[
          ["spares", "Spares & Rates"],
          ["labour", "Labour / Service Charges"],
          ["faults", "Fault Master"],
          ["call-types", "Call Types & Valid Days"],
          ["projects", "Projects / Schemes"],
          ["approval-rules", "Approval Rules"],
        ].map(([resource, title]) => ({
          key: `/masters/config/${resource}`,
          icon: <SettingOutlined />,
          label: <Link href={`/masters/config/${resource}`}>{title}</Link>,
        })),
        {
          key: "/masters/text-lists",
          icon: <OrderedListOutlined />,
          label: <Link href="/masters/text-lists">Text Lists</Link>,
        },
        {
          key: "/system/activity",
          icon: <HistoryOutlined />,
          label: <Link href="/system/activity">Activity & Message Log</Link>,
        },
      ],
    },
  ];

  // Dealers and customers see the prototype portal wording (e.g. "My Warranty") for the same screens.
  const roleLabel = (child: any) => { const custom = formForPath(child.key)?.labels?.[user?.Role as RoleCode]; return custom ? { ...child, label: <Link href={child.key}>{custom}</Link> } : child; };
  // Groups start collapsed; only the group holding the current page opens so its link is visible.
  const initialOpenKeys = menuItems.filter((item: any) => item.children?.some((child: any) => pathname === child.key || pathname.startsWith(`${child.key}/`))).map((item: any) => item.key);
  // Screen rights: hide links the user cannot open (the middleware also blocks them), and drop empty groups.
  const allowedPath = (path: string) => { const form = formForPath(path); return !form || canUseForm(user, form.key); };
  const visibleMenu = menuItems
    .map((item: any) => (item.children ? { ...item, children: item.children.filter((child: any) => allowedPath(child.key)).map(roleLabel) } : item))
    .filter((item: any) => !item.children || item.children.length > 0);
  const stateNames = (() => {
    if (!user || user.IsAdmin || user.Role === "SUPER") return "All states";
    const ids = parseList(user.StateRights).map((s) => s.toLowerCase());
    return ids.length ? states.filter((s: any) => ids.includes(String(s.StateId).toLowerCase())).map((s: any) => s.ShortName || s.StateName).join(", ") || "Selected states" : "All states";
  })();

  const userDropdownItems = [
    {
      key: "profile",
      label: (
        <div className="py-1">
          <p className="font-semibold text-slate-800 text-sm">
            {user ? `${user.FirstName} ${user.LastName || ""}`.trim() : "Administrator"}
          </p>
          <p className="text-xs text-slate-500">@{user?.Username || "admin"}</p>
          <div className="mt-1">
            <Tag color="blue" className="text-[10px] font-semibold uppercase">
              {user?.Role || "SUPER"}
            </Tag>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] truncate" title={stateNames}>States: {stateNames}</p>
        </div>
      ),
    },
    { type: "divider" as const },
    ...(allowedPath("/admin/users") ? [{
      key: "users",
      icon: <TeamOutlined />,
      label: <Link href="/admin/users">User Management</Link>,
    }] : []),
    ...(allowedPath("/masters/company") ? [{
      key: "company",
      icon: <BankOutlined />,
      label: <Link href="/masters/company">Company Profile</Link>,
    }] : []),
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined className="text-red-500" />,
      label: <span className="text-red-600 font-medium">Sign Out</span>,
      onClick: () => logout(),
    },
  ];

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <PageLoader label="Starting Delta iERP…" hint="Warranty & Service" minHeight="100vh" />
      </div>
    );
  }

  return (
    <Layout className="app-shell">
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        trigger={null}
        width={280}
        theme="light"
        className="app-sidebar border-r border-slate-200/80 select-none"
      >
        {/* Brand */}
        <Link
          href="/"
          className={`h-16 flex items-center ${collapsed ? "justify-center px-2" : "px-4"} border-b border-slate-100 bg-white hover:bg-slate-50/50 transition-colors`}
        >
          <div className="flex items-center space-x-3 overflow-hidden">
            <img
              src="/logo-mark.png"
              alt="Delta iERP"
              className="h-9 w-auto object-contain shrink-0"
            />
            {!collapsed && (
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center leading-none">
                  <span className="text-[17px] font-black text-slate-900 tracking-tight font-sans">
                    Delta
                  </span>
                  <span className="text-[17px] font-black text-[#009688] tracking-tight ml-1 font-sans">
                    iERP
                  </span>
                </div>
                <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase mt-1 leading-none">
                  WARRANTY & SERVICE
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Navigation Menu */}
        <div className="py-2">
          <Menu
            mode="inline"
            selectedKeys={[pathname]}
            defaultOpenKeys={initialOpenKeys}
            items={visibleMenu}
            className="border-none text-slate-600 font-medium"
          />
        </div>
      </Sider>

      <Drawer
        title={
          <div className="flex items-center space-x-2.5">
            <img
              src="/logo-mark.png"
              alt="Delta iERP"
              className="h-7 w-auto object-contain shrink-0"
            />
            <div className="flex flex-col leading-none">
              <div className="flex items-center">
                <span className="text-base font-black text-slate-900">Delta</span>
                <span className="text-base font-black text-[#009688] ml-1">iERP</span>
              </div>
              <span className="text-[8px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">
                WARRANTY & SERVICE
              </span>
            </div>
          </div>
        }
        placement="left"
        width="min(300px, 88vw)"
        open={isMobile && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        styles={{ body: { padding: "12px 4px" } }}
      >
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={initialOpenKeys}
          items={visibleMenu}
          onClick={() => setMobileMenuOpen(false)}
          className="border-none"
        />
      </Drawer>

      {/* Main Shell */}
      <Layout className="app-main">
        {/* Top Header */}
        <Header className="app-header">
          {/* Left section: Hamburger & Module / Brand Indicator */}
          <div className="flex items-center space-x-3">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              aria-label={isMobile ? "Open navigation" : collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={isMobile ? mobileMenuOpen : !collapsed}
              onClick={() => (isMobile ? setMobileMenuOpen(true) : setCollapsed(!collapsed))}
              className="text-slate-600 hover:text-blue-600 text-base h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100"
            />
            {/* Client brand (logo is 320×57, so width follows the fixed height) */}
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <Link href="/" aria-label="Solartive — go to dashboard" className="flex items-center shrink-0">
              <img
                src="/solartive-logo-sm.png"
                alt="Solartive"
                width={180}
                height={32}
                className="h-7 sm:h-8 w-auto max-w-[150px] sm:max-w-none object-contain select-none"
                draggable={false}
              />
            </Link>
          </div>

          {/* Center section: Global Search */}
          <div className="hidden md:flex items-center flex-1 max-w-lg mx-6">
            <GlobalSearch />
          </div>

          {/* User account */}
          <div className="flex items-center space-x-3">

            {/* Premium Profile Card Button */}
            <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight" trigger={["click"]}>
              <div
                role="button"
                tabIndex={0}
                aria-label="User Account Menu"
                className="flex items-center space-x-2.5 px-2.5 py-1.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer select-none group"
              >
                <Avatar
                  style={{
                    background: "linear-gradient(135deg, #1677ff 0%, #003eb3 100%)",
                    verticalAlign: "middle",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                  size={32}
                  className="font-bold text-xs"
                >
                  {user?.FirstName?.[0]?.toUpperCase() || "A"}
                </Avatar>
                <div className="hidden sm:block text-left leading-none">
                  <div className="font-bold text-slate-800 text-xs tracking-tight">
                    {user ? `${user.FirstName} ${user.LastName || ""}`.trim() : "Delta Admin"}
                  </div>
                  <div className="text-[10px] font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100/70 text-blue-700 font-semibold text-[9px] uppercase tracking-wider">
                      {user?.Role || "SUPER"}
                    </span>
                  </div>
                </div>
                <DownOutlined className="text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors ml-0.5" />
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* Content body */}
        <Content className="app-content" id="main-content">
          <div className="app-page" key={pathname}>{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
