import type { MetadataRoute } from "next";

// PWA manifest. Students add Coco English to the home screen and get a
// fullscreen view without the browser URL bar. No service worker: every core
// flow (speech scoring, turn evaluation, Supabase) needs the network, so an
// offline shell would have nothing to do — and a stale cached bundle mid-mission
// is not something a student can hard-refresh their way out of.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coco English",
    short_name: "Coco",
    description: "Speaking practice for classrooms",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#2563EB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
