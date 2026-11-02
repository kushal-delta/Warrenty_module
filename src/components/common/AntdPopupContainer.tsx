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
          borderRadius: 6,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          controlHeight: 36,
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

export default AntdPopupContainer;
