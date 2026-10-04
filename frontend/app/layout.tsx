import type { Metadata, Viewport } from "next";
import "./globals.css";
import AccessGate from "./components/AccessGate";

export const metadata: Metadata = {
  title: "NutriSync | Your nutrition, beautifully tracked",
  description: "Premium nutrition dashboard and AI coach for everyday Indian food tracking.",
  applicationName: "NutriSync",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NutriSync", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2f4d42",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccessGate>{children}</AccessGate>
      </body>
    </html>
  );
}
