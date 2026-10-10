import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/dm-sans";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./tokens.css";
import "./globals.css";
import "./enhancements.css";
import "./polish.css";
import AccessGate from "./components/AccessGate";
import GoalBurst from "./components/GoalBurst";
import QuickAdd from "./components/QuickAdd";
import WarmUp from "./components/WarmUp";

export const metadata: Metadata = {
  title: "NutriSync | The Pantry Almanac",
  description: "Crafted nutrition tracker & AI coach for everyday Indian food tracking.",
  applicationName: "NutriSync",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NutriSync", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#284236",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccessGate>{children}</AccessGate>
        <WarmUp />
        <QuickAdd />
        <GoalBurst />
      </body>
    </html>
  );
}
