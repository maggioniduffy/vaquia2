import type { MetadataRoute } from "next";
import { t } from "@/i18n/es-AR";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t.app.name,
    short_name: t.app.name,
    description: t.app.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#F5F7FA",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
