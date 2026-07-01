import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Coco English",
  description: "Speaking practice for classrooms",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: [
              "*, *::before, *::after { box-sizing: border-box; }",
              "body { margin: 0; }",
              ":focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }",
              "@keyframes spin { to { transform: rotate(360deg); } }",
              ".spinner { display: inline-block; width: 1em; height: 1em; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: -0.15em; }",
            ].join("\n"),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
