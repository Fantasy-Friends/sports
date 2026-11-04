import type { MetadataRoute } from "next";

// Web app manifest — this is what makes "Add to Home Screen" produce a real
// app icon that opens full-screen. On iOS, web push only works once the site
// is installed this way (iOS 16.4+), so `display: "standalone"` is required.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fantasy Friends — 2026 Ultimate Sports Decathlon",
    short_name: "Fantasy Friends",
    description: "Season-long fantasy sports decathlon across every major event of 2026.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08201a",
    theme_color: "#0b2a22",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
