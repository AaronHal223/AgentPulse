import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "AgentPulse AI", template: "%s · AgentPulse" },
  description: "Client profiles that evolve, homes found across the web and scored 1–10, and a daily brief for real estate agents.",
  applicationName: "AgentPulse",
  appleWebApp: { capable: true, title: "AgentPulse", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
