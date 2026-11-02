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
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useMasterStore } from "@/lib/store/useMasterStore";

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

  const { user, fetchCurrentUser, logout, isAuthenticated } = useAuthStore();
  const { fetchBootstrap, company } = useMasterStore();

  useEffect(() => {
    setMounted(true);
    fetchCurrentUser();
    fetchBootstrap();
  }, [fetchCurrentUser, fetchBootstrap]);

  const menuItems = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: <Link href="/">Dashboard</Link>,
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
          label: <Link href="/warranty/register">Register Installation</Link>,
        },
        {
          key: "/warranty/active",
          icon: <SafetyCertificateOutlined />,
          label: <Link href="/warranty/active">Active Warranties</Link>,
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
      ],
    },
    {
      key: "sub-service",
      icon: <CustomerServiceOutlined />,
      label: "Service Management",
      children: [
        {
          key: "/service/complaints",
          icon: <CustomerServiceOutlined />,
          label: <Link href="/service/complaints">Complaints Register</Link>,
        },
      ],
    },
    {
      key: "sub-masters",
      icon: <AppstoreOutlined />,
      label: "Configuration",
      children: [
        {
          key: "/masters/product-models",
          icon: <AppstoreOutlined />,
          label: <Link href="/masters/product-models">Product Models</Link>,
        },
        {
          key: "/masters/company",
          icon: <BankOutlined />,
          label: <Link href="/masters/company">Company Profile</Link>,
        },
      ],
    },
  ];

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
        </div>
      ),
    },
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
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className="min-h-screen">
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        trigger={null}
        width={240}
        theme="light"
        className="border-r border-slate-200/80 shadow-xs select-none"
      >
        {/* Brand */}
        <div className="h-16 flex items-center px-4 border-b border-slate-100 bg-white">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold shrink-0 shadow-sm shadow-blue-500/20">
              <SafetyCertificateOutlined className="text-lg" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="text-sm font-extrabold text-slate-900 tracking-tight block truncate">
                  Delta Warranty
                </span>
                <span className="text-[11px] text-slate-400 font-medium block truncate">
                  Solartive Techno
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="py-2">
          <Menu
            mode="inline"
            selectedKeys={[pathname]}
            defaultOpenKeys={["sub-warranty", "sub-service", "sub-masters"]}
            items={menuItems}
            className="border-none text-slate-600 font-medium"
          />
        </div>
      </Sider>

      {/* Main Shell */}
      <Layout>
        {/* Top Header */}
        <Header className="h-16 bg-white border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
          <div className="flex items-center space-x-3">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="text-slate-600 hover:text-blue-600 text-base"
            />
            <div className="hidden sm:block">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                PostgreSQL Live DB
              </span>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center space-x-3">
            <Link href="/warranty/verify">
              <Button
                type="default"
                icon={<SearchOutlined />}
                className="hidden md:inline-flex items-center text-xs font-semibold rounded-lg border-slate-300 hover:border-blue-500 hover:text-blue-600"
              >
                Verify Serial
              </Button>
            </Link>

            <Link href="/warranty/register">
              <Button
                type="primary"
                icon={<PlusCircleOutlined />}
                className="inline-flex items-center text-xs font-semibold rounded-lg shadow-sm bg-blue-600"
              >
                Register
              </Button>
            </Link>

            <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight" trigger={["click"]}>
              <button className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200">
                <Avatar
                  style={{ backgroundColor: "#1677ff", verticalAlign: "middle" }}
                  size="small"
                >
                  {user?.FirstName?.[0] || "A"}
                </Avatar>
                <div className="hidden md:block text-left text-xs leading-tight">
                  <div className="font-semibold text-slate-800">
                    {user?.FirstName || "Admin"}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {user?.Role || "SUPER"}
                  </div>
                </div>
              </button>
            </Dropdown>
          </div>
        </Header>

        {/* Content body */}
        <Content className="p-4 md:p-6 bg-slate-50 min-h-[calc(100vh-64px)] overflow-x-hidden">
          <div className="max-w-7xl mx-auto">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
