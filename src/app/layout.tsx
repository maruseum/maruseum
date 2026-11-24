import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "마루 중개 통합관리",
  description: "토지·건물 매입 고객 중개 업무 통합관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
