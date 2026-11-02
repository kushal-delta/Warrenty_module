"use client";

import React from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";

export interface InlineAddButtonProps {
  tooltip?: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * RULES §5: Inline Create (+ Button Pattern)
 * Renders next to reference dropdowns to open inline creation modal.
 */
export const InlineAddButton: React.FC<InlineAddButtonProps> = ({
  tooltip = "Create new",
  onClick,
  className = "",
  disabled = false,
}) => {
  return (
    <Tooltip title={tooltip}>
      <Button
        type="default"
        icon={<PlusOutlined />}
        onClick={onClick}
        disabled={disabled}
        className={`shrink-0 ml-1.5 flex items-center justify-center border-gray-300 hover:border-blue-500 hover:text-blue-600 ${className}`}
      />
    </Tooltip>
  );
};

export default InlineAddButton;
