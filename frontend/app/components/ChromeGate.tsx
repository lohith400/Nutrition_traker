"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Hides the app's floating helpers (warm-up banner, quick add, goal burst) on the public /story page. */
export default function ChromeGate({ children }: { children: ReactNode }) {
  const path = usePathname() || "";
  if (path === "/story" || path.startsWith("/story/")) return null;
  return <>{children}</>;
}
