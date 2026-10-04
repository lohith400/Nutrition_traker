"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const STORAGE_KEY = "nutrisync_access_key";

// Runs once when the app loads in the browser (before any page fetches data): every request
// to the NutriSync API carries the saved access key, and a 401 asks for it.
if (typeof window !== "undefined" && !(window as any).__nutrisyncFetchPatched) {
  (window as any).__nutrisyncFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API)) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) headers.set("X-Access-Key", key);
    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) window.dispatchEvent(new Event("nutrisync-auth-required"));
    return response;
  };
}

export default function AccessGate({ children }: { children: ReactNode }) {
  const [needKey, setNeedKey] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const show = () => setNeedKey(true);
    window.addEventListener("nutrisync-auth-required", show);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("nutrisync-auth-required", show);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, value.trim());
    window.location.reload();
  }

  return (
    <>
      {children}
      {needKey && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(246,243,238,0.97)", display: "grid", placeItems: "center", padding: 24 }}>
          <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontFamily: "inherit" }}>Enter your access key</h2>
            <p style={{ margin: 0, opacity: 0.7 }}>This is the ACCESS_KEY you set on the server. It is saved on this device only.</p>
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Access key"
              style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #cfc8bb", fontSize: 16 }}
            />
            <button type="submit" style={{ padding: "12px 14px", borderRadius: 12, border: 0, background: "#2f4d42", color: "#fff", fontSize: 16, cursor: "pointer" }}>
              Unlock
            </button>
          </form>
        </div>
      )}
    </>
  );
}
