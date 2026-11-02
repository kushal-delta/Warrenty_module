"use client";

import React, { useState } from "react";
import { Input, Button, Card, Tag, Alert, Spin } from "antd";
import {
  SearchOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { formatDate } from "@/lib/utils/dateFormat";

export default function WarrantyVerifyPage() {
  const [serialInput, setSerialInput] = useState("");
  const { verifySerial, verifyResult, isLoading } = useWarrantyStore();
  const [searched, setSearched] = useState(false);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!serialInput.trim()) return;
    setSearched(true);
    await verifySerial(serialInput.trim());
  };

  const quickSamples = ["2404PU30001", "2404MO30001", "2404CT30001", "2307PU20001"];

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-2xl shadow-lg shadow-blue-500/20">
          <SafetyCertificateOutlined />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Serial Number Warranty Verification
        </h1>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          Instant status check of pump, motor, or controller serials against active database records
        </p>
      </div>

      {/* Search Input Box */}
      <Card className="shadow-md border-slate-200 rounded-2xl p-4">
        <form onSubmit={handleVerify} className="flex gap-2">
          <Input
            size="large"
            prefix={<BarcodeOutlined className="text-slate-400 text-lg mr-1" />}
            placeholder="Type or scan component serial number (e.g. 2404PU30001)..."
            value={serialInput}
            onChange={(e) => setSerialInput(e.target.value)}
            className="font-mono text-base font-semibold uppercase rounded-xl"
            allowClear
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => handleVerify()}
            loading={isLoading}
            className="bg-blue-600 rounded-xl px-6 font-semibold"
          >
            Verify
          </Button>
        </form>

        <div className="mt-4 flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Quick test serials:</span>
          {quickSamples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSerialInput(s);
                verifySerial(s);
                setSearched(true);
              }}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 font-mono text-[11px] font-medium transition-colors border border-slate-200"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {/* Results Section */}
      {isLoading && (
        <div className="py-12 text-center">
          <Spin size="large" />
          <p className="text-xs text-slate-500 mt-3 font-medium">
            Querying live database records...
          </p>
        </div>
      )}

      {!isLoading && searched && verifyResult && (
        <div className="space-y-4">
          {verifyResult.found && verifyResult.isRegistered ? (
            <Card className="shadow-lg border-slate-200 rounded-2xl overflow-hidden p-2">
              <div
                className={`p-4 rounded-xl flex items-center justify-between ${
                  verifyResult.isUnderWarranty
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center space-x-3">
                  {verifyResult.isUnderWarranty ? (
                    <CheckCircleOutlined className="text-3xl text-emerald-600" />
                  ) : (
                    <CloseCircleOutlined className="text-3xl text-amber-600" />
                  )}
                  <div>
                    <h3 className="text-base font-bold">
                      {verifyResult.isUnderWarranty
                        ? "Active Warranty Verified"
                        : "Warranty Expired"}
                    </h3>
                    <p className="text-xs opacity-90">
                      {verifyResult.isUnderWarranty
                        ? `${verifyResult.daysLeft} days remaining in coverage period`
                        : "Coverage period has ended. Chargeable service applies."}
                    </p>
                  </div>
                </div>

                <Tag
                  color={verifyResult.isUnderWarranty ? "success" : "warning"}
                  className="text-xs font-bold px-3 py-1 uppercase"
                >
                  {verifyResult.data?.Category}
                </Tag>
              </div>

              <div className="mt-4 p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-y-3 text-xs border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-slate-400 block">Serial Number:</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {verifyResult.data?.SerialNo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Warranty Certificate No:</span>
                    <span className="font-semibold text-blue-700">
                      {verifyResult.data?.WarrantyNo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Product Model:</span>
                    <span className="font-medium text-slate-800">
                      {verifyResult.data?.ModelName || "Standard Model"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Coverage Period:</span>
                    <span className="text-slate-700">
                      {formatDate(verifyResult.data?.StartDate, false)} to{" "}
                      {formatDate(verifyResult.data?.EndDate, false)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block">Customer Name:</span>
                    <span className="font-semibold text-slate-800">
                      {verifyResult.data?.CustomerName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Customer Phone:</span>
                    <span className="font-mono text-slate-800">
                      {verifyResult.data?.CustomerMobile}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Site Location:</span>
                    <span className="text-slate-700">
                      {verifyResult.data?.Village}, {verifyResult.data?.District}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Authorized Dealer:</span>
                    <span className="font-medium text-slate-800">
                      {verifyResult.data?.DealerName || "Direct / HO"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ) : verifyResult.found && !verifyResult.isRegistered ? (
            <Alert
              type="info"
              showIcon
              message={
                <span className="font-bold text-slate-800">
                  Unregistered Serial (In Stock / Generated)
                </span>
              }
              description={
                <div className="text-xs text-slate-600 mt-1 space-y-1">
                  <p>
                    Serial <span className="font-mono font-bold">{serialInput}</span> is generated
                    in the sticker register but has not yet been linked to an active installation.
                  </p>
                  <p>
                    Status: <Tag color="blue">{verifyResult.sticker?.Status}</Tag> • Category:{" "}
                    <Tag>{verifyResult.sticker?.Category}</Tag>
                  </p>
                </div>
              }
              className="rounded-2xl"
            />
          ) : (
            <Alert
              type="error"
              showIcon
              message={<span className="font-bold">Serial Not Found</span>}
              description={`No record matching serial "${serialInput}" was found in the database. Please check the serial code printed on the pump, motor, or controller label.`}
              className="rounded-2xl"
            />
          )}
        </div>
      )}
    </div>
  );
}
