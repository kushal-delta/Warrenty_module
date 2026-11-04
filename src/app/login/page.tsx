"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, Alert, message } from "antd";
import { UserOutlined, LockOutlined, ArrowRightOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { reportFormError } from "@/lib/utils/formErrors";
import { useRouter } from "next/navigation";


const FEATURES = [
  "Excel sticker import & QR warranty cards",
  "Dealer, customer & HO portals",
  "Pump / Motor / Controller — own warranty each",
  "Complaint → visit → job card → approval",
  "Replacement with balance warranty",
  "Engineer-wise spares stock",
];

export default function LoginPage() {
  const [form] = Form.useForm();
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  // Arriving here right after "Sign Out" → confirm it.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("logoutNotice")) {
        window.sessionStorage.removeItem("logoutNotice");
        message.success({ content: "You have been signed out successfully.", duration: 3 });
      }
    } catch {}
  }, []);

  const handleFinish = async (values: any) => {
    try {
      setSubmitting(true);
      clearError();
      const user = await login({ username: String(values.username).trim(), password: values.password });
      const name = [user?.FirstName, user?.LastName].filter(Boolean).join(" ") || user?.Username || "";
      message.success({ content: `Login successful — welcome${name ? `, ${name}` : ""}!`, duration: 3 });
      // Back to the page the middleware sent us from (same-site paths only), else the dashboard
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      const target = redirect && /^\/(?![\/\\])/.test(redirect) &&!redirect.startsWith("/login") ? redirect : "/";
      router.replace(target);
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Invalid username or password" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell flex flex-col font-sans bg-slate-50">
    <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row"
      style={{ background: "linear-gradient(135deg, #082a33 0%, #0b3d47 38%, #0a6467 72%, #099089 100%)" }}>
      {/* Soft glows, like the prototype backdrop */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] w-[640px] h-[640px] rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-120px] left-[-80px] w-[360px] h-[360px] rounded-full bg-amber-300/10 blur-3xl" />

      {/* LEFT: brand hero */}
      <section className="relative z-10 lg:w-1/2 flex items-center px-6 sm:px-12 lg:px-[6%] py-10 lg:py-0 text-white">
        <div className="max-w-xl">
          <div className="inline-flex bg-white rounded-xl px-4 py-3 shadow-lg shadow-black/20">
            <img src="/solartive-logo.png" alt="Solartive" className="h-9 sm:h-12 w-auto object-contain select-none" draggable={false} />
          </div>

          <h1 className="mt-6 text-3xl sm:text-[40px] font-black tracking-tight leading-none">
            Warranty <span className="text-[#22c3c9]">&amp; Service</span>
          </h1>
          <p className="mt-3 text-[11px] sm:text-xs font-semibold tracking-[0.22em] uppercase text-slate-300/80">
            Solar Submersible Pump · Motor · Controller
          </p>

          <p className="mt-8 text-xl sm:text-[26px] font-light leading-snug text-slate-100">
            One QR sticker. <b className="font-bold text-[#f6a93b]">Warranty</b> registered in seconds,{" "}
            <b className="font-bold text-[#f6a93b]">service</b> tracked to closure.
          </p>

          <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px] text-slate-200">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#f6a93b]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* RIGHT: sign-in card */}
      <section className="login-panel relative z-10 flex items-center justify-center px-4 sm:px-8 py-10 lg:py-0 lg:w-1/2 bg-slate-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8">
          {/* Header */}
          <div className="mb-5 sm:mb-6">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-2.5 border border-blue-200/80">
              <SafetyCertificateOutlined className="text-xs" />
              <span>Authorized Portal Access</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Sign In</h2>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">Enter your credentials to access the warranty &amp; service workspace</p>
          </div>

          {error && <Alert message={error} type="error" showIcon closable onClose={clearError} className="mb-4 rounded-lg border-red-200 py-1.5 text-xs" />}

          <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
            <Form.Item name="username" className="!mb-4"
              label={<span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Username</span>}
              rules={[{ required: true, message: "Username is required" }]}>
              <Input prefix={<UserOutlined className="text-slate-400 text-sm mr-1.5" />} placeholder="Enter username" size="large" autoComplete="username"
                className="h-11 rounded-lg border-slate-300 font-medium text-sm text-slate-900" />
            </Form.Item>
            <Form.Item name="password" className="!mb-4"
              label={<span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Password</span>}
              rules={[{ required: true, message: "Password is required" }]}>
              <Input.Password prefix={<LockOutlined className="text-slate-400 text-sm mr-1.5" />} placeholder="Enter password" size="large" autoComplete="current-password"
                className="h-11 rounded-lg border-slate-300 font-medium text-sm text-slate-900" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" loading={submitting || isLoading} icon={<ArrowRightOutlined />}
              className="w-full h-11 text-sm font-bold shadow-md bg-blue-600 hover:bg-blue-700 border-none rounded-lg mt-2 flex items-center justify-center">
              Sign In to Workspace
            </Button>
          </Form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] font-medium text-slate-400">© 2026 Delta Infosoft Pvt. Ltd. • All rights reserved.</p>
          </div>
        </div>
      </section>
    </div>

      {/* Vendor footer */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <img src="/logo-full.png" alt="Delta Infosoft" className="h-8 w-auto object-contain select-none" draggable={false} />
          <div className="h-8 w-px bg-slate-200" />
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-slate-800">Deltainfosoft Pvt. Ltd.</div>
            <div className="text-xs font-medium text-[#0f8f95]">Enterprise Solutions Provider</div>
          </div>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} Deltainfosoft Pvt. Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
