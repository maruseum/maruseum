"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** active 인 동안 주기적으로 서버 화면을 다시 불러옵니다 (통화 녹음 처리 상태 갱신용). */
export function AutoRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
