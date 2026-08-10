import Link from "next/link";

export const metadata = { title: "비밀번호 재설정" };

export default function ResetPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-[#f5f6f2] p-6"><section className="w-full max-w-md rounded-3xl border border-[#e3e8e4] bg-white p-8"><h1 className="text-2xl font-bold">비밀번호 재설정</h1><p className="mt-2 text-sm text-[#6d7772]">가입한 이메일로 재설정 링크를 보내드립니다.</p><form className="mt-7"><label className="text-sm font-medium">이메일<input type="email" required className="focus-ring mt-2 w-full rounded-xl border border-[#dce3de] px-3 py-3" /></label><button className="focus-ring mt-5 w-full rounded-xl bg-[#1f6b4f] px-4 py-3 font-semibold text-white">재설정 링크 보내기</button></form><Link href="/login" className="mt-5 block text-center text-sm text-[#1f6b4f]">로그인으로 돌아가기</Link></section></main>;
}
