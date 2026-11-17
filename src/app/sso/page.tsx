"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Button, Spin } from "antd";
import { LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/lib/store/useAuthStore";

/**
 * /sso?token=<64-char token> — landing page for the iERP "Warranty" menu (public route).
 * Exchanges the one-time iERP token for a normal Warranty session (POST /api/Auth/ssoLogin), then opens the dashboard
 * with replace(), which also takes the token out of the address bar and the history. On failure the user goes to the
 * login page with the reason (/login?sso=…), where they can still sign in with a password.
 */
export default function SsoPage() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return; // React dev mode runs effects twice — the token is single use
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token") || "";
    // Remove the token from the address bar straight away (it is single use anyway).
    try { window.history.replaceState(null, "", "/sso"); } catch {}
    if (!token) { router.replace("/login?sso=invalid"); return; }

    axios.post("/api/Auth/ssoLogin", { token })
      .then(({ data }) => {
        useAuthStore.setState({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false, error: null });
        router.replace("/");
      })
      .catch((err) => {
        setFailed(true);
        const code = err?.response?.data?.code;
        router.replace(`/login?sso=${encodeURIComponent(code || "error")}`);
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
        <img src="/solartive-logo.png" alt="Solartive" className="mx-auto h-10 w-auto object-contain" draggable={false} />
        {failed ? (
          <>
            <WarningOutlined className="mt-6 text-3xl text-amber-500" />
            <p className="mt-3 text-sm text-slate-600">Could not sign you in from iERP. Taking you to the login page…</p>
            <Button className="mt-4" onClick={() => router.replace("/login")}>Go to login</Button>
          </>
        ) : (
          <>
            <Spin className="mt-7" indicator={<LoadingOutlined className="text-3xl text-blue-600" spin />} />
            <p className="mt-4 text-sm font-semibold text-slate-800">Signing you in from iERP…</p>
            <p className="mt-1 text-xs text-slate-500">Warranty &amp; Service</p>
          </>
        )}
      </div>
    </div>
  );
}
