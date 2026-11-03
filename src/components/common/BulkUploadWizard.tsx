"use client";

import React, { useState } from "react";
import {
  Modal,
  Steps,
  Button,
  Upload,
  Table,
  Alert,
  Tag,
  message,
} from "antd";
import {
  InboxOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";

const { Dragger } = Upload;

export interface BulkUploadColumn<T = any> {
  key: string;
  header: string;
  required?: boolean;
  validate?: (value: any, row: T) => string | null; // returns error message if invalid
}

export interface BulkUploadWizardProps {
  open: boolean;
  title: string;
  templateFileName: string;
  columns: BulkUploadColumn[];
  sampleData?: Record<string, any>[];
  onUpload: (
    validRows: Record<string, any>[]
  ) => Promise<{ inserted: number; skipped: number; failed: number; errors?: string[] }>;
  onClose: () => void;
}

interface ParsedRow {
  _rowId: number;
  _isValid: boolean;
  _errors: string[];
  [key: string]: any;
}

/**
 * RULES §8: 4-step Bulk Upload Wizard (Upload -> Validate -> Preview -> Confirm)
 */
export const BulkUploadWizard: React.FC<BulkUploadWizardProps> = ({
  open,
  title,
  templateFileName,
  columns,
  sampleData = [],
  onUpload,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [fileList, setFileList] = useState<any[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    skipped: number;
    failed: number;
    errors?: string[];
  } | null>(null);

  const resetState = () => {
    setCurrentStep(0);
    setFileList([]);
    setParsedRows([]);
    setIsSubmitting(false);
    setUploadResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // 1. Download CSV / XLSX template
  const handleDownloadTemplate = () => {
    const headers = columns.map((col) => col.header);
    const data =
      sampleData.length > 0
        ? sampleData.map((row) => {
            const rowData: Record<string, any> = {};
            columns.forEach((col) => {
              rowData[col.header] = row[col.key] ?? "";
            });
            return rowData;
          })
        : [
            columns.reduce((acc, col) => {
              acc[col.header] = col.required ? `Sample ${col.header}*` : `Sample ${col.header}`;
              return acc;
            }, {} as Record<string, any>),
          ];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, `${templateFileName}_Template.xlsx`);
    message.success("Template downloaded successfully");
  };

  // 2. File parsing and validation
  const processFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rawRows.length === 0) {
        message.error("The uploaded file contains no data rows.");
        return;
      }

      // Map raw rows against column definitions
      const validated: ParsedRow[] = rawRows.map((raw, index) => {
        const rowErrors: string[] = [];
        const cleanRow: Record<string, any> = { _rowId: index + 1 };

        columns.forEach((col) => {
          // match header case-insensitively
          const keyInRaw = Object.keys(raw).find(
            (k) => k.trim().toLowerCase() === col.header.trim().toLowerCase()
          );
          const rawVal = keyInRaw !== undefined ? raw[keyInRaw] : "";
          const valStr = String(rawVal).trim();
          cleanRow[col.key] = valStr;

          if (col.required && !valStr) {
            rowErrors.push(`${col.header} is required`);
          }

          if (col.validate && valStr) {
            const err = col.validate(valStr, raw);
            if (err) rowErrors.push(err);
          }
        });

        return {
          ...cleanRow,
          _isValid: rowErrors.length === 0,
          _errors: rowErrors,
        } as ParsedRow;
      });

      setParsedRows(validated);
      setCurrentStep(1); // Move to Validate step
    } catch (err: any) {
      message.error(`Failed to parse file: ${err.message || "Unknown format"}`);
    }
  };

  // 3. Confirm and Submit to API
  const handleConfirmUpload = async () => {
    const validRows = parsedRows.filter((r) => r._isValid);
    if (validRows.length === 0) {
      message.error("No valid rows to upload. Please fix errors first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await onUpload(validRows);
      setUploadResult(res);
      setCurrentStep(3); // Result summary step
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || "Bulk upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r._isValid).length;
  const invalidCount = parsedRows.length - validCount;

  const tableColumns = [
    {
      title: "#",
      dataIndex: "_rowId",
      width: 60,
    },
    {
      title: "Status",
      dataIndex: "_isValid",
      width: 120,
      render: (isValid: boolean, row: ParsedRow) =>
        isValid ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Valid
          </Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            Invalid
          </Tag>
        ),
    },
    ...columns.map((col) => ({
      title: col.header,
      dataIndex: col.key,
      render: (val: any) => val || <span className="text-gray-400 italic">-</span>,
    })),
    {
      title: "Validation Issues",
      dataIndex: "_errors",
      render: (errors: string[]) =>
        errors.length > 0 ? (
          <div className="text-xs text-red-600 space-y-0.5">
            {errors.map((e, idx) => (
              <div key={idx}>• {e}</div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-green-600">No issues</span>
        ),
    },
  ];

  return (
    <Modal
      open={open}
      title={<span className="text-base font-semibold">{title}</span>}
      onCancel={handleClose}
      width={1000}
      footer={null}
      destroyOnClose
    >
      <div className="py-2 space-y-6">
        <Steps
          current={currentStep}
          items={[
            { title: "Upload File" },
            { title: "Validate" },
            { title: "Preview" },
            { title: "Confirm" },
          ]}
        />

        {/* STEP 0: Upload File */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
              <span className="text-sm text-blue-800">
                Need a starting template with required column headers?
              </span>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleDownloadTemplate}
              >
                Download Template (.xlsx)
              </Button>
            </div>

            <Dragger
              name="file"
              multiple={false}
              fileList={fileList}
              accept=".xlsx,.xls,.csv"
              beforeUpload={(file) => {
                const isExcelOrCsv =
                  file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                  file.type === "application/vnd.ms-excel" ||
                  file.name.endsWith(".csv") ||
                  file.name.endsWith(".xlsx") ||
                  file.name.endsWith(".xls");

                if (!isExcelOrCsv) {
                  message.error("Please upload an Excel (.xlsx, .xls) or CSV file only!");
                  return Upload.LIST_IGNORE;
                }
                const isLt10M = file.size / 1024 / 1024 < 10;
                if (!isLt10M) {
                  message.error("File must be smaller than 10MB!");
                  return Upload.LIST_IGNORE;
                }

                setFileList([file]);
                processFile(file);
                return false;
              }}
              onRemove={() => setFileList([])}
            >
              <p className="ant-upload-drag-icon text-blue-500">
                <InboxOutlined className="text-4xl" />
              </p>
              <p className="ant-upload-text font-medium text-gray-700">
                Click or drag Excel/CSV file to this area to upload
              </p>
              <p className="ant-upload-hint text-xs text-gray-500">
                Supported formats: .xlsx, .xls, .csv. File size limit: 10MB.
              </p>
            </Dragger>
          </div>
        )}

        {/* STEP 1 & 2: Validate & Preview */}
        {(currentStep === 1 || currentStep === 2) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Tag color="blue" className="text-sm px-2.5 py-1">
                  Total Rows: {parsedRows.length}
                </Tag>
                <Tag color="success" className="text-sm px-2.5 py-1">
                  Valid: {validCount}
                </Tag>
                {invalidCount > 0 && (
                  <Tag color="error" className="text-sm px-2.5 py-1">
                    Invalid: {invalidCount}
                  </Tag>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Button onClick={() => setCurrentStep(0)}>Re-upload File</Button>
                <Button
                  type="primary"
                  disabled={validCount === 0}
                  loading={isSubmitting}
                  onClick={handleConfirmUpload}
                >
                  Upload {validCount} Valid Row{validCount > 1 ? "s" : ""}
                </Button>
              </div>
            </div>

            {invalidCount > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${invalidCount} row${invalidCount > 1 ? "s" : ""} have validation issues and will be skipped if you proceed.`}
              />
            )}

            <Table
              dataSource={parsedRows}
              columns={tableColumns}
              rowKey="_rowId"
              size="small"
              pagination={{
                defaultPageSize: 8,
                showSizeChanger: true,
                pageSizeOptions: ["5", "8", "15", "25"],
              }}
              scroll={{ x: "max-content" }}
            />
          </div>
        )}

        {/* STEP 3: Confirm Summary */}
        {currentStep === 3 && uploadResult && (
          <div className="py-6 text-center space-y-4">
            <CheckCircleOutlined className="text-5xl text-green-500" />
            <h3 className="text-xl font-bold text-gray-800">Bulk Upload Completed!</h3>
            <div className="flex justify-center space-x-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center w-32">
                <div className="text-2xl font-bold text-green-700">
                  {uploadResult.inserted}
                </div>
                <div className="text-xs text-green-600 font-medium mt-1">Inserted</div>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center w-32">
                <div className="text-2xl font-bold text-amber-700">
                  {uploadResult.skipped}
                </div>
                <div className="text-xs text-amber-600 font-medium mt-1">Skipped</div>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center w-32">
                <div className="text-2xl font-bold text-red-700">
                  {uploadResult.failed}
                </div>
                <div className="text-xs text-red-600 font-medium mt-1">Failed</div>
              </div>
            </div>

            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="text-left bg-gray-50 border border-gray-200 p-3 rounded-md text-xs text-red-600 max-h-32 overflow-y-auto">
                <div className="font-semibold mb-1">Server notes:</div>
                {uploadResult.errors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}

            <div className="pt-4">
              <Button type="primary" onClick={handleClose}>
                Done & View Records
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkUploadWizard;
