import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans, DM_Mono } from "next/font/google";
import "./tokens.css";
import "./globals.css";
import "./enhancements.css";
import AccessGate from "./components/AccessGate";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

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
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>
        <AccessGate>{children}</AccessGate>
      </body>
    </html>
  );
}
