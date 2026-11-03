"use client";

import React from "react";
import { Button, Tooltip } from "antd";
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
} from "@ant-design/icons";

export const DRAWER_WIDTH = "min(960px, 100%)";

export const DRAWER_HEADER_STYLE: React.CSSProperties = {
  padding: 0,
  borderBottom: "none",
  background: "linear-gradient(135deg, var(--theme-gradient-from, #003eb3), var(--theme-gradient-to, #1677ff))",
};

export interface DrawerChipProps {
  label: string;
  tone?: "outline" | "solid";
  color?: string;
  className?: string;
}

export const DrawerChip: React.FC<DrawerChipProps> = ({
  label,
  tone = "outline",
  color,
  className = "",
}) => {
  const isSolid = tone === "solid";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide shadow-xs ${
        isSolid
          ? "bg-white text-blue-900 font-semibold shadow-sm"
          : "bg-white/15 text-white border border-white/30 backdrop-blur-xs"
      } ${className}`}
      style={color ? { borderColor: color, color } : undefined}
    >
      {label}
    </span>
  );
};

export interface DrawerHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onClose: () => void;
}

/**
 * RULES §44: Entry Drawers — One Header Component, One Width
 */
export const DrawerHeader: React.FC<DrawerHeaderProps> = ({
  icon,
  title,
  subtitle,
  meta,
  maximized = false,
  onToggleMaximize,
  onClose,
}) => {
  return (
    <div className="flex items-center justify-between px-4 sm:px-6 py-4 w-full text-white select-none">
      {/* Left: Icon, Title, Subtitle, Meta chips */}
      <div className="flex items-center space-x-3.5 min-w-0">
        {icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/15 text-xl backdrop-blur-xs text-white shrink-0 shadow-inner">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
            <h2 className="text-lg font-bold text-white tracking-tight break-words leading-tight">
              {title}
            </h2>
            {meta && <div className="flex items-center space-x-1.5 flex-wrap">{meta}</div>}
          </div>
          {subtitle && (
            <p className="text-xs text-blue-100 font-normal leading-normal mt-1 break-words">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Maximize/Restore & Close controls */}
      <div className="flex items-center space-x-1 shrink-0 ml-4">
        {onToggleMaximize && (
          <Tooltip title={maximized ? "Restore size" : "Maximize drawer"}>
            <Button
              type="text"
              icon={
                maximized ? (
                  <FullscreenExitOutlined className="text-white text-base" />
                ) : (
                  <FullscreenOutlined className="text-white text-base" />
                )
              }
              aria-label={maximized ? "Restore drawer size" : "Maximize drawer"}
              onClick={onToggleMaximize}
              className="text-white hover:bg-white/20 transition-colors"
            />
          </Tooltip>
        )}
        <Tooltip title="Close (Esc)">
          <Button
            type="text"
            icon={<CloseOutlined className="text-white text-base" />}
            aria-label="Close drawer"
            onClick={onClose}
            className="text-white hover:bg-white/20 hover:text-red-200 transition-colors"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default DrawerHeader;
