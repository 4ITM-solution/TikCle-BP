import type { Metadata } from "next";
import "./globals.css";
import { Topbar } from "@/components/layout/topbar";

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
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex flex-col h-screen overflow-hidden">
          <Topbar />
          <main className="overflow-y-auto" style={{ minHeight: 0, flex: 1 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
