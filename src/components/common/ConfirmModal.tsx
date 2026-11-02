"use client";

import React from "react";
import { Modal, Button, Alert } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

export interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  warningText?: string;
  items?: Array<string | React.ReactNode>;
  okText?: string;
  cancelText?: string;
  loading?: boolean;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * RULES §16: Confirmation Modals — State-controlled dedicated Modal
 * Never uses Modal.confirm().
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = "Confirm Deletion",
  description = "Are you sure you want to delete this record? This action cannot be undone.",
  warningText = "Child records linked to this entity must be removed first if restricted.",
  items,
  okText = "Delete",
  cancelText = "Cancel",
  loading = false,
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      open={open}
      title={
        <div className="flex items-center space-x-2 text-gray-800">
          <ExclamationCircleOutlined
            className={isDanger ? "text-red-500 text-lg" : "text-amber-500 text-lg"}
          />
          <span className="font-semibold">{title}</span>
        </div>
      }
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          {cancelText}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          danger={isDanger}
          loading={loading}
          onClick={onConfirm}
        >
          {okText}
        </Button>,
      ]}
      centered
      destroyOnClose
    >
      <div className="py-2 space-y-3">
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>

        {warningText && (
          <Alert
            type={isDanger ? "warning" : "info"}
            showIcon
            message={<span className="text-xs font-medium">{warningText}</span>}
          />
        )}

        {items && items.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md bg-gray-50 p-2.5 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Affected item{items.length > 1 ? "s" : ""}:
            </p>
            <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
              {items.map((item, idx) => (
                <li key={idx} className="truncate">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ConfirmModal;
