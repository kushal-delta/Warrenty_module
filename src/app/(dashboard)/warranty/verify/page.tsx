"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Tag, Tooltip, message } from "antd";
import {
  BarcodeOutlined, CheckCircleFilled, CloseCircleFilled, CopyOutlined, ExclamationCircleFilled, FileSearchOutlined, HistoryOutlined,
  MinusCircleFilled, PhoneOutlined, SafetyCertificateOutlined, SearchOutlined, ToolOutlined, UserOutlined, EnvironmentOutlined, ShopOutlined,
} from "@ant-design/icons";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { canUseForm } from "@/lib/auth/forms";
import { formatDate } from "@/lib/utils/dateFormat";
import { copyText } from "@/lib/utils/clipboard";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { PageLoader } from "@/components/common/Loader";
import { PageHeader } from "@/components/common/PageHeader";
import { VIZ } from "@/components/dashboard/Charts";
import { CategoryIcon, DaysRing, StatusBadge, WarrantyGauge, periodOf, statusKeyOf, type PassportStatus } from "@/components/warranty/SerialPassport";
import { ServiceCallFormDrawer } from "@/components/service/ServiceCallFormDrawer";

/**
 * Serial Number Warranty Verification — answer first: a verdict card (status, days-left ring, coverage gauge), the three
 * checks behind it (found → registered → in coverage), then who / where / what. Same passport parts as Serial No. Search Report.
 */

const CARD = "bg-white rounded-xl border border-slate-200 shadow-xs";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const CAT_TAG: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };
const SAMPLES = ["2404PU30001", "2404MO30001", "2404CT30001", "2307PU20001"];
const RECENT_KEY = "verifyRecentSerials";
const STATUS_COLOR: Record<PassportStatus, string> = { active: VIZ.aqua, expiring: VIZ.yellow, expired: VIZ.red, replaced: "#94a3b8", void: "#64748b" };
const STATUS_DOT: Record<string, string> = { active: "bg-emerald-500", expiring: "bg-amber-500", expired: "bg-red-500", replaced: "bg-slate-400", void: "bg-slate-500", stock: "bg-blue-500", none: "bg-slate-300" };

interface Recent { sn: string; k: string }

type StepState = "ok" | "fail" | "warn" | "idle";
function CheckTrail({ steps }: { steps: { title: string; sub: string; state: StepState }[] }) {
  const ICON: Record<StepState, React.ReactNode> = {
    ok: <CheckCircleFilled className="text-emerald-500" />, fail: <CloseCircleFilled className="text-red-500" />,
    warn: <ExclamationCircleFilled className="text-amber-500" />, idle: <MinusCircleFilled className="text-slate-300" />,
  };
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${s.state === "ok" ? "border-emerald-100 bg-emerald-50/50" : s.state === "fail" ? "border-red-100 bg-red-50/50" : s.state === "warn" ? "border-amber-100 bg-amber-50/50" : "border-slate-200 bg-slate-50"}`}>
          <span className="mt-0.5 text-lg leading-none">{ICON[s.state]}</span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-slate-800">{s.title}</div>
            <div className="text-[11.5px] text-slate-500">{s.sub}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className={`m-0 mt-0.5 break-words text-sm text-slate-800 ${mono ? "font-mono font-semibold" : ""}`}>{children || <span className="text-slate-300">—</span>}</dd>
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className={`${CARD} p-4`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-base text-blue-700">{icon}</span>
        <h3 className="m-0 text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-y-3">{children}</dl>
    </section>
  );
}

export default function WarrantyVerifyPage() {
  const [serialInput, setSerialInput] = useState("");
  const { verifySerial, verifyResult, isLoading } = useWarrantyStore();
  const user = useAuthStore((s) => s.user);
  const [searched, setSearched] = useState(false);
  const [checked, setChecked] = useState(""); // the serial the shown result belongs to
  const [recent, setRecent] = useState<Recent[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const canCall = Boolean(user && canUseForm(user, "service.complaints"));
  const canRegister = Boolean(user && canUseForm(user, "warranty.register"));
  const canPassport = Boolean(user && canUseForm(user, "warranty.search"));

  useEffect(() => { try { setRecent(JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")); } catch { /* no history */ } }, []);
  const remember = (sn: string, res: any) => {
    const w = res?.data;
    const k = !res?.found ? "none" : !res?.isRegistered ? "stock"
      : statusKeyOf({ Status: w?.Status, State: res.isUnderWarranty ? (res.daysLeft <= 45 ? "expiring" : "active") : undefined });
    setRecent((prev) => {
      const next = [{ sn, k }, ...prev.filter((r) => r.sn !== sn)].slice(0, 6);
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const run = async (raw: string) => {
    const sn = raw.trim().toUpperCase();
    if (!sn) return;
    setSerialInput(sn);
    setSearched(true);
    setChecked(sn);
    try { remember(sn, await verifySerial(sn)); }
    catch { message.error("Could not verify the serial number. Please try again."); }
  };

  // Opened from the global search: /warranty/verify?serial=XXXX verifies straight away.
  useUrlQuery("serial", (serial) => { run(serial); });

  const handleVerify = (e?: React.FormEvent) => { e?.preventDefault(); run(serialInput); };

  const res = verifyResult;
  const w = res?.data;
  const registered = Boolean(res?.found && res?.isRegistered);

  // ----- warranty verdict (registered serials) -----
  const daysLeft = Number(res?.daysLeft || 0);
  const status: PassportStatus = statusKeyOf({ Status: w?.Status, State: res?.isUnderWarranty ? (daysLeft <= 45 ? "expiring" : "active") : undefined });
  const period = registered ? periodOf(w) : null;
  const live = status === "active" || status === "expiring";
  const verdict = {
    active: { title: "Under warranty", note: `${daysLeft} days of free service coverage remain.` },
    expiring: { title: "Warranty ending soon", note: `Only ${daysLeft} days of coverage left — a good time to offer renewal / AMC.` },
    expired: { title: "Warranty expired", note: "The coverage period has ended. Chargeable service applies." },
    replaced: { title: "Unit replaced", note: "This serial was replaced by another unit; its warranty moved to the new serial." },
    void: { title: "Warranty void", note: "Head office has set this warranty to void. Chargeable service applies." },
  }[status];
  const ring = live
    ? { pct: period ? 100 - period.elapsedPct : 100, big: String(daysLeft), small: daysLeft === 1 ? "day left" : "days left" }
    : { pct: 0, big: status === "expired" ? "Ended" : status === "replaced" ? "Replaced" : "Void", small: status === "expired" && period ? `${Math.max(0, -period.daysLeft)} days ago` : "no coverage" };
  const accent = STATUS_COLOR[status];

  const copySerial = async () => { if (await copyText(w?.SerialNo || checked)) message.success({ content: "Serial number copied", duration: 1.5 }); };
  const preset = w ? { serialNo: w.SerialNo, category: w.Category, mobile: w.CustomerMobile } : null;

  return (
    <div className="space-y-4">
      {/* ---------- header + search (same page frame as the other screens: full width, header on the left) ---------- */}
      <PageHeader icon={<SafetyCertificateOutlined />} title="Serial Number Warranty Verification" subtitle="Check the warranty status of a pump, motor or controller — type or scan the serial number" />

      <section className={`${CARD} p-4 sm:p-5`}>
        <form onSubmit={handleVerify} className="flex flex-col gap-3 sm:flex-row">
          <Input size="large" autoFocus allowClear value={serialInput} onChange={(e) => setSerialInput(e.target.value.toUpperCase())}
            prefix={<BarcodeOutlined className="mr-1 text-lg text-slate-400" />} placeholder="Type or scan component serial number (e.g. 2404PU30001)…"
            className="rounded-xl font-mono text-base font-semibold" />
          <Button htmlType="submit" type="primary" size="large" icon={<SearchOutlined />} loading={isLoading} className="rounded-xl bg-blue-600 px-7 font-semibold">Verify</Button>
        </form>
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {recent.length ? <><span className="inline-flex items-center gap-1 font-semibold text-slate-600"><HistoryOutlined />Recent checks</span>
            {recent.map((r) => (
              <button key={r.sn} type="button" onClick={() => run(r.sn)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-medium transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.k] || STATUS_DOT.none}`} />{r.sn}
              </button>))}</>
            : <><span className="font-semibold text-slate-600">Quick test serials:</span>
              {SAMPLES.map((s) => (
                <button key={s} type="button" onClick={() => run(s)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-medium transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{s}</button>))}</>}
        </div>
      </section>

      {/* ---------- result ---------- */}
      {isLoading && <PageLoader label="Checking warranty status…" minHeight={160} />}

      {!isLoading && searched && res && (
        <div className="verify-pop space-y-4">
          {registered ? (
            <>
              <section className={`${CARD} overflow-hidden`} style={{ borderTop: `4px solid ${accent}` }}>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
                  <DaysRing pct={ring.pct} color={accent} big={ring.big} small={ring.small} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      {w?.Category && <Tag color={CAT_TAG[w.Category]} className="m-0 text-[10px]">{w.Category}</Tag>}
                      <Tooltip title="Found in the sticker register and registered to an installation">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><SafetyCertificateOutlined />Authentic</span>
                      </Tooltip>
                    </div>
                    <h2 className="mt-2 text-xl font-extrabold leading-tight text-slate-900">{verdict.title}</h2>
                    <p className="mb-0 mt-1 text-sm text-slate-600">{verdict.note}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-700"><CategoryIcon category={w?.Category} /></span>
                      <div className="min-w-0">
                        <div className="break-words text-sm font-bold text-slate-900">{w?.ModelName || "Model not recorded"}</div>
                        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-500">{w?.SerialNo}
                          <Tooltip title="Copy serial number"><button type="button" onClick={copySerial} aria-label="Copy serial number" className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"><CopyOutlined className="text-[11px]" /></button></Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center border-t border-slate-100 px-5 py-5 lg:border-l lg:border-t-0"><WarrantyGauge warranty={{ ...w, DaysLeft: daysLeft }} status={status} /></div>
                </div>
              </section>

              <section className={`${CARD} p-4`}>
                <div className={`${LABEL} mb-2.5`}>How this was verified</div>
                <CheckTrail steps={[
                  { title: "Serial found", sub: "Printed in the sticker register", state: "ok" },
                  { title: "Registered", sub: w?.InstallDate ? `Installed ${formatDate(w.InstallDate)}` : "Linked to an installation", state: "ok" },
                  { title: live ? "In coverage" : "Coverage over", sub: live ? `Valid till ${formatDate(w?.EndDate)}` : `Ended ${formatDate(w?.EndDate)}`, state: live ? (status === "expiring" ? "warn" : "ok") : "fail" },
                ]} />
              </section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <InfoCard icon={<SafetyCertificateOutlined />} title="Warranty">
                  <Fact label="Certificate no"><span className="font-semibold text-blue-700">{w?.WarrantyNo}</span></Fact>
                  <Fact label="Coverage">{period ? `${formatDate(period.start)} → ${formatDate(period.end)}` : `${formatDate(w?.StartDate)} → ${formatDate(w?.EndDate)}`}</Fact>
                  <Fact label="Period">{w?.WarrantyMonths != null ? `${w.WarrantyMonths} months${Number(w?.ExtendedMonths) ? ` + ${w.ExtendedMonths} extended` : ""}` : null}</Fact>
                  <Fact label="Model code" mono>{w?.ModelCode}</Fact>
                </InfoCard>
                <InfoCard icon={<UserOutlined />} title="Customer">
                  <Fact label="Name"><span className="font-semibold">{w?.CustomerName}</span></Fact>
                  <Fact label="Phone">{w?.CustomerMobile ? <a href={`tel:${w.CustomerMobile}`} className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-600 hover:underline"><PhoneOutlined />{w.CustomerMobile}</a> : null}</Fact>
                  <Fact label="Site"><span className="inline-flex items-start gap-1.5"><EnvironmentOutlined className="mt-1 text-slate-400" />{[w?.Village, w?.District].filter(Boolean).join(", ") || null}</span></Fact>
                </InfoCard>
                <InfoCard icon={<ShopOutlined />} title="Sold & installed">
                  <Fact label="Authorized dealer">{w?.DealerName || "Direct / HO"}</Fact>
                  <Fact label="Installation no" mono>{w?.InstallNo}</Fact>
                  <Fact label="Installed on">{w?.InstallDate ? formatDate(w.InstallDate) : null}</Fact>
                </InfoCard>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canPassport && <Link href={`/warranty/search?sn=${encodeURIComponent(w?.SerialNo || checked)}`}><Button icon={<FileSearchOutlined />}>Open full passport</Button></Link>}
                {canCall && <Button type="primary" icon={<ToolOutlined />} className="bg-blue-600" onClick={() => setCallOpen(true)}>Book a service call</Button>}
                <span className="text-xs text-slate-400">Opens the complete history: calls, visits, job cards, replacements.</span>
              </div>
            </>
          ) : res.found ? (
            <>
              <section className={`${CARD} overflow-hidden`} style={{ borderTop: "4px solid #3987e5" }}>
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[26px] text-blue-700"><CategoryIcon category={res.sticker?.Category} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800"><ExclamationCircleFilled />Not registered yet</span>
                      {res.sticker?.Category && <Tag color={CAT_TAG[res.sticker.Category]} className="m-0 text-[10px]">{res.sticker.Category}</Tag>}
                    </div>
                    <h2 className="mt-2 text-xl font-extrabold leading-tight text-slate-900">Genuine serial — warranty not started</h2>
                    <p className="mb-0 mt-1 text-sm text-slate-600">This serial exists in the sticker register but is not linked to an installation, so no warranty is running. The warranty starts when it is registered.</p>
                    <div className="mt-2 font-mono text-sm font-semibold text-slate-600">{res.sticker?.SerialNo || checked}</div>
                  </div>
                </div>
              </section>
              <section className={`${CARD} p-4`}>
                <div className={`${LABEL} mb-2.5`}>How this was verified</div>
                <CheckTrail steps={[
                  { title: "Serial found", sub: "Printed in the sticker register", state: "ok" },
                  { title: "Not registered", sub: "No installation linked yet", state: "warn" },
                  { title: "Coverage", sub: "Starts on registration", state: "idle" },
                ]} />
              </section>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoCard icon={<BarcodeOutlined />} title="Sticker record">
                  <Fact label="Stock status"><Tag color="blue" className="m-0">{res.sticker?.Status}</Tag></Fact>
                  <Fact label="Product model">{res.sticker?.ModelName}</Fact>
                  <Fact label="Model code" mono>{res.sticker?.ModelCode}</Fact>
                </InfoCard>
                <InfoCard icon={<ShopOutlined />} title="Supply">
                  <Fact label="Invoice no" mono>{res.sticker?.InvoiceNo}</Fact>
                  <Fact label="Invoice date">{res.sticker?.InvoiceDate ? formatDate(res.sticker.InvoiceDate) : null}</Fact>
                  <Fact label="Manufactured">{res.sticker?.MfgDate ? formatDate(res.sticker.MfgDate) : null}</Fact>
                </InfoCard>
              </div>
              {canRegister && <div><Link href="/warranty/register"><Button type="primary" className="bg-blue-600" icon={<SafetyCertificateOutlined />}>Register this warranty</Button></Link></div>}
            </>
          ) : (
            <section className={`${CARD} overflow-hidden`} style={{ borderTop: "4px solid #ef4444" }}>
              <div className="flex flex-wrap items-center gap-4 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[26px] text-red-600"><CloseCircleFilled /></div>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700"><CloseCircleFilled />Serial not found</span>
                  <h2 className="mt-2 text-xl font-extrabold leading-tight text-slate-900">No record for “{checked}”</h2>
                  <p className="mb-0 mt-1 text-sm text-slate-600">This serial is not in the sticker register or the warranty list.</p>
                </div>
              </div>
              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <CheckTrail steps={[
                  { title: "Serial found", sub: "Not in the sticker register", state: "fail" },
                  { title: "Registered", sub: "Not checked", state: "idle" },
                  { title: "Coverage", sub: "Not checked", state: "idle" },
                ]} />
                <ul className="m-0 mt-3 space-y-1 pl-4 text-xs text-slate-500">
                  <li>Re-check the serial printed on the pump, motor or controller label.</li>
                  <li>Letters <b>O</b> and digits <b>0</b>, or <b>I</b> and <b>1</b>, are easy to mix up.</li>
                  <li>A fake or tampered sticker will not be found — note the serial and report it to head office.</li>
                </ul>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---------- book a service call straight from the verified serial ---------- */}
      {canCall && preset && (
        <ServiceCallFormDrawer open={callOpen} onClose={() => setCallOpen(false)} preset={preset}
          onSaved={(no) => { setCallOpen(false); message.success(`Service call ${no} registered`); }} />
      )}
    </div>
  );
}
