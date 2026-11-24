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

// api/recordings 는 제외: proxy 는 요청 본문을 10MB 까지만 버퍼링하므로 큰 녹음 파일이 잘립니다.
// 해당 경로는 핸들러에서 직접 로그인을 확인합니다.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/recordings|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
