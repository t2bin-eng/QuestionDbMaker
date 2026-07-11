import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiz DB Maker",
  description: "PDF 문제지를 검토 가능한 퀴즈 DB로 변환합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
