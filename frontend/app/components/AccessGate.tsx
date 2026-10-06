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
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(244,240,232,0.96)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 24 }}>
          <form onSubmit={submit} style={{ width: "100%", maxWidth: 390, background: "#ffffff", border: "1px solid var(--border-rule, #e4ded2)", borderRadius: 16, padding: "28px 26px", display: "grid", gap: 14, boxShadow: "0 18px 45px rgba(28,27,24,0.12)" }}>
            <span className="almanac-eyebrow" style={{ fontSize: "10px", letterSpacing: "1.2px", color: "var(--muted, #6d685c)", textTransform: "uppercase", fontWeight: 700 }}>
              SECURITY ARCHIVE · VAULT GATE
            </span>
            <h2 className="almanac-serif" style={{ margin: 0, fontSize: "24px", color: "var(--ink, #1c1b18)" }}>
              Enter your access key
            </h2>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--ink-light, #5c574c)", lineHeight: 1.55 }}>
              This is the secret access key configured for your NutriSync backend. It is stored securely on this local device only.
            </p>
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter server access key…"
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #d5cebf", fontSize: 15, background: "#faf8f2", outline: "none", color: "var(--ink, #1c1b18)" }}
            />
            <button type="submit" className="primary-btn" style={{ padding: "12px 14px", borderRadius: 10, border: 0, background: "var(--sage-dark, #2f4d42)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
              Unlock Pantry Archive ✦
            </button>
          </form>
        </div>
      )}
    </>
  );
}
