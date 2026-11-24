import type { NextConfig } from "next";

// 내부 업무 시스템이라 거의 모든 화면이 로그인 사용자별 동적 데이터입니다.
// Cache Components 를 끄고 요청마다 렌더링하는 기본 동작을 씁니다.
const nextConfig: NextConfig = {
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
