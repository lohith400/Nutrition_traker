import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriSync | Your nutrition, beautifully tracked",
  description: "Premium nutrition dashboard and AI coach for everyday Indian food tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
