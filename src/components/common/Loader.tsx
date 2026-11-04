import React from "react";

/**
 * One loader for the whole app.
 *  - <LoaderRing />   the spinner itself; also the default indicator of every antd <Spin> (set in AntdPopupContainer)
 *  - <PageLoader />   centred ring + message for an area that has nothing to show yet (drawer, page, card)
 */
const SIZES = { small: 18, default: 30, large: 44 } as const;

export function LoaderRing({ size = "default", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const px = SIZES[size] || SIZES.default;
  return <span className={`app-loader-ring ${className}`} style={{ width: px, height: px }} role="presentation" />;
}

export function PageLoader({ label = "Loading…", hint, minHeight = 320, className = "" }: { label?: string; hint?: string; minHeight?: number | string; className?: string }) {
  return (
    <div className={`app-page-loader ${className}`} style={{ minHeight }} role="status" aria-live="polite">
      <LoaderRing size="large" />
      <div className="app-page-loader-label">{label}</div>
      {hint && <div className="app-page-loader-hint">{hint}</div>}
    </div>
  );
}
