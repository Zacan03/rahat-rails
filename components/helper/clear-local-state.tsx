"use client";

import { useEffect } from "react";

/** Shared-phone safety: the neutral family picker wipes all per-family browser state. */
export function ClearLocalState() {
  useEffect(() => {
    try {
      for (const store of [window.localStorage, window.sessionStorage]) {
        Object.keys(store).filter((k) => k.startsWith("rr:")).forEach((k) => store.removeItem(k));
      }
      window.speechSynthesis?.cancel();
    } catch {
      // storage may be blocked; nothing sensitive is stored there anyway
    }
  }, []);
  return null;
}
