import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Coco English",
  description: "Speaking practice for classrooms",
  // iOS ignores the manifest for the home-screen icon and standalone mode, so
  // these have to be declared separately from manifest.ts.
  appleWebApp: { capable: true, title: "Coco", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: [
              "*, *::before, *::after { box-sizing: border-box; }",
              "body { margin: 0; }",
              ":focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }",
              "@keyframes spin { to { transform: rotate(360deg); } }",
              ".spinner { display: inline-block; width: 1em; height: 1em; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: -0.15em; }",
              "@keyframes thinking-dot-bounce { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }",
              "@media (prefers-reduced-motion: reduce) { .thinking-dot { animation: none !important; opacity: 1 !important; } }",
            ].join("\n"),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
