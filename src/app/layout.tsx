import type { Metadata } from "next";
import "./globals.css";
import { Topbar } from "@/components/layout/topbar";
import { Sidenav } from "@/components/layout/sidenav";

export const metadata: Metadata = {
  title: "TikCle BP",
  description: "Brand performance internal tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div
          className="grid min-h-screen"
          style={{ gridTemplateRows: "56px 1fr", gridTemplateColumns: "200px 1fr" }}
        >
          <Topbar />
          <Sidenav />
          <main className="overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
