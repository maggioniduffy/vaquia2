import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import "./globals.css";

export const metadata: Metadata = {
  title: t.app.name,
  description: t.app.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F3" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1C1F" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html
      lang="es-AR"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
