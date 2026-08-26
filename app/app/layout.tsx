import type { Metadata } from "next";
import "./globals.css";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export const metadata: Metadata = {
  title: "VibeWP — Build something ownable",
  description:
    "Real WordPress sites your clients can edit forever — never a locked-in export.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  );
}
