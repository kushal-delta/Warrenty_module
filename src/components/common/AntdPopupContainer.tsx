"use client";

import React from "react";
import { ConfigProvider, App as AntdApp } from "antd";

interface AntdPopupContainerProps {
  children: React.ReactNode;
}

/**
 * RULES §46: Global popup container provider
 * Selects, date pickers and dropdowns portal into the nearest .ant-drawer-body or .ant-modal-body,
 * falling back to document.body.
 */
export function AntdPopupContainer({ children }: AntdPopupContainerProps) {
  const getPopupContainer = (triggerNode?: HTMLElement): HTMLElement => {
    if (typeof document === "undefined") {
      return null as any;
    }
    if (!triggerNode) {
      return document.body;
    }

    // Find nearest drawer or modal body
    const container = triggerNode.closest(".ant-drawer-body, .ant-modal-body");
    return (container as HTMLElement) || document.body;
  };

  return (
    <ConfigProvider
      getPopupContainer={getPopupContainer}
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          colorText: "#1e293b",
          colorTextSecondary: "#64748b",
          colorBorder: "#d8e0eb",
          colorBgLayout: "#f5f7fb",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          controlHeight: 40,
        },
        components: {
          Card: { paddingLG: 24, headerHeight: 56 },
          Form: { itemMarginBottom: 20, verticalLabelPadding: "0 0 8px" },
          Table: { cellPaddingBlockSM: 14, cellPaddingInlineSM: 16, headerBg: "#f8fafc" },
          Menu: { itemHeight: 44, itemBorderRadius: 8 },
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

export default AntdPopupContainer;
