"use client";

import { useEffect, useRef } from "react";

/** Fired by the global search when it navigates, so a page that is already open can react without remounting. */
export const GLOBAL_SEARCH_EVENT = "global-search:navigate";

export function announceNavigation(url: string) {
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_EVENT, { detail: { url } }));
}

/**
 * Applies a query-string value (e.g. ?q=SC/26-27/0007) to the page: once when the page opens,
 * and again whenever the global search navigates to this same page with a new value.
 */
export function useUrlQuery(param: string, apply: (value: string) => void) {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const read = (search: string) => {
      const value = new URLSearchParams(search).get(param);
      if (value) applyRef.current(value);
    };
    read(window.location.search);
    const onNavigate = (event: Event) => {
      const url = new URL((event as CustomEvent<{ url: string }>).detail.url, window.location.origin);
      if (url.pathname === window.location.pathname) read(url.search);
    };
    window.addEventListener(GLOBAL_SEARCH_EVENT, onNavigate);
    return () => window.removeEventListener(GLOBAL_SEARCH_EVENT, onNavigate);
  }, [param]);
}
