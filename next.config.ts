import type { NextConfig } from "next";

// 내부 업무 시스템이라 거의 모든 화면이 로그인 사용자별 동적 데이터입니다.
// Cache Components 를 끄고 요청마다 렌더링하는 기본 동작을 씁니다.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 엑셀 가져오기: 5MB 파일 업로드 + 미리보기·저장 시 표 데이터 왕복
      bodySizeLimit: "12mb",
    },
  },
  // exceljs 는 Node 전용 의존성이 많아 번들하지 않고 런타임에 불러옵니다.
  serverExternalPackages: ["exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
