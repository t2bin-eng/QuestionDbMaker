import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "로그인" };

export default function LoginPage() {
  return <main className="grid min-h-screen bg-[#f5f6f2] lg:grid-cols-2">
    <section className="hidden bg-[#173b30] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Link href="/" className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-white text-xl font-black text-[#1f6b4f]">Q</span><b>문항 카드 스튜디오</b></Link>
      <div className="max-w-lg"><p className="text-sm text-[#a9c8bb]">교사를 위한 문항 워크플로</p><h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-.04em]">PDF에서 문항 카드로,<br/>문항 카드에서 새 문제지로.</h1><p className="mt-6 leading-7 text-[#c8ddd4]">자동 감지 결과를 직접 검토하고 원본 모양을 보존한 고해상도 문항으로 관리하세요.</p></div>
      <p className="text-xs text-[#89aa9c]">비공개 작업 공간 · 파일은 내 PC에 저장</p>
    </section>
    <section className="grid place-items-center p-6"><div className="w-full max-w-md rounded-3xl border border-[#e3e8e4] bg-white p-8 shadow-sm"><span className="text-sm font-semibold text-[#1f6b4f]">WELCOME BACK</span><h2 className="mt-3 text-3xl font-bold tracking-[-.04em]">작업 공간에 로그인</h2><p className="mt-2 text-sm text-[#6d7772]">학교 또는 개인 계정의 이메일을 입력하세요.</p><AuthForm /></div></section>
  </main>;
}
