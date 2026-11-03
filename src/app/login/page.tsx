"use client";

import React, { useState } from "react";
import { Form, Input, Button, Alert } from "antd";
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  BarcodeOutlined,
  ThunderboltOutlined,
  CustomerServiceOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { reportFormError } from "@/lib/utils/formErrors";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [form] = Form.useForm();
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: any) => {
    try {
      setSubmitting(true);
      clearError();
      await login(values);
      router.push("/");
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Invalid username or password" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell flex flex-col lg:flex-row bg-slate-100 font-sans">
      {/* LEFT COLUMN: Premium Enterprise Showcase (Desktop) */}
      <div className="lg:w-1/2 h-auto lg:h-full bg-gradient-to-br from-[#071329] via-[#0d2347] to-[#040c1a] p-6 lg:p-8 xl:p-12 flex flex-col justify-between text-white relative overflow-hidden shrink-0">
        {/* Subtle decorative glow circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

        {/* Top: Brand Headers */}
        <div className="relative z-10 space-y-3 xl:space-y-4">
          <div className="flex items-center space-x-3 flex-wrap gap-y-2">
            {/* Solartive Logo in crisp white pill */}
            <div className="bg-white px-3.5 py-1.5 rounded-xl shadow-md flex items-center justify-center">
              <img
                src="/solartive-logo.png"
                alt="Solartive Logo"
                className="h-6 sm:h-7 w-auto object-contain"
              />
            </div>
            <div className="h-5 w-px bg-slate-700 hidden sm:block" />
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-xs font-semibold text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Delta iERP System 2.0</span>
            </div>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-white tracking-tight leading-snug">
              Delta Warranty & Customer Service Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-lg leading-relaxed">
              Enterprise lifecycle management for solar submersible pump sets, motor components, MPPT controllers, dealer dispatches, and nationwide field complaints.
            </p>
          </div>
        </div>

        {/* Middle: Core Platform Highlights */}
        <div className="relative z-10 my-3 xl:my-6 space-y-2 xl:space-y-3 max-w-lg hidden sm:block">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start space-x-3 hover:bg-white/10 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-base border border-blue-400/20">
              <BarcodeOutlined />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">
                Serial & Sticker Tracking
              </h4>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-snug">
                Manufacturing lot batches, QR sticker printing, and serial dispatch registry.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start space-x-3 hover:bg-white/10 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-base border border-emerald-400/20">
              <ThunderboltOutlined />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">
                Atomic Installation Registration
              </h4>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-snug">
                Register site details, the beneficiary, and pump set warranties in one step.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start space-x-3 hover:bg-white/10 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 text-base border border-indigo-400/20">
              <CustomerServiceOutlined />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">
                Service Helpdesk & Field Engineers
              </h4>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-snug">
                Breakdown ticket allocation, service center escalation, spare consumption, and resolution audit.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom: Partner & Compliance Badge */}
        <div className="relative z-10 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-300">Client:</span>
            <span>Solartive Techno Industries Pvt. Ltd.</span>
          </div>
          <div className="flex items-center space-x-1.5 text-emerald-400 font-medium">
            <CheckCircleFilled className="text-xs" />
            <span>Warranty & Service</span>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Crisp, High-Contrast Authentication Panel */}
      <div className="login-panel flex-1 lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 xl:p-12 bg-slate-50">
        <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 my-auto">
          {/* Header */}
          <div className="mb-5 sm:mb-6">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-2.5 border border-blue-200/80">
              <SafetyCertificateOutlined className="text-xs" />
              <span>Authorized Portal Access</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Sign In
            </h2>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
              Enter your credentials to access the warranty & service workspace
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={clearError}
              className="mb-4 rounded-lg border-red-200 py-1.5 text-xs"
            />
          )}

          {/* Form */}
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            requiredMark={false}
          >
            <Form.Item
              name="username"
              className="!mb-4"
              label={
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Username
                </span>
              }
              rules={[{ required: true, message: "Username is required" }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-400 text-sm mr-1.5" />}
                placeholder="Enter username"
                size="large"
                className="h-11 rounded-lg border-slate-300 font-medium text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </Form.Item>

            <Form.Item
              name="password"
              className="!mb-4"
              label={
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </span>
              }
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400 text-sm mr-1.5" />}
                placeholder="Enter password"
                size="large"
                className="h-11 rounded-lg border-slate-300 font-medium text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={submitting || isLoading}
              icon={<ArrowRightOutlined />}
              className="w-full h-11 text-sm font-bold shadow-md bg-blue-600 hover:bg-blue-700 border-none rounded-lg mt-2 flex items-center justify-center cursor-pointer"
            >
              Sign In to Workspace
            </Button>
          </Form>

          {/* Footer Branding */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] font-medium text-slate-400">
              © 2026 Delta Infosoft Pvt. Ltd. • All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
