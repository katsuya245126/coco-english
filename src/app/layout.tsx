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
            ].join("\n"),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
