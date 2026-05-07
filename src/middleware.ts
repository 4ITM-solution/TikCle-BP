import { NextResponse, type NextRequest } from "next/server";

/**
 * 전체 대시보드 HTTP Basic Auth 게이트.
 *
 * 환경변수:
 *   - DASHBOARD_USER (default: tikcle)
 *   - DASHBOARD_PASSWORD (필수 — 박혀있을 때만 활성)
 *
 * DASHBOARD_PASSWORD 안 박혀있으면 보호 비활성 (로컬 dev 편의).
 *
 * Inngest webhook + Vercel internal asset은 보호 우회.
 */

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  // 비번 미설정 → 게이트 비활성 (로컬 dev / 실수로 락아웃 방지)
  if (!password) return NextResponse.next();

  const path = req.nextUrl.pathname;

  // Inngest webhook은 외부 서비스가 호출하므로 인증 우회
  if (path.startsWith("/api/inngest")) return NextResponse.next();

  const expectedUser = process.env.DASHBOARD_USER || "tikcle";

  const authHeader = req.headers.get("authorization") || "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sepIdx = decoded.indexOf(":");
      if (sepIdx >= 0) {
        const user = decoded.slice(0, sepIdx);
        const pass = decoded.slice(sepIdx + 1);
        if (user === expectedUser && pass === password) {
          return NextResponse.next();
        }
      }
    } catch {
      // base64 decode 실패 → 401
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TikCle BP", charset="UTF-8"',
    },
  });
}

export const config = {
  // 정적 자산(_next/static, favicon 등)은 매처에서 빼서 인증 우회.
  // 그 외 모든 경로 (페이지·API·RSC) 보호.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
