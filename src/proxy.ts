import { NextResponse, type NextRequest } from "next/server";

// 쿠키 유무만 보는 1차 확인입니다. 실제 세션 검증은 서버(requireUser)에서 합니다.
const SESSION_COOKIE = "maru_session";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLogin = request.nextUrl.pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
