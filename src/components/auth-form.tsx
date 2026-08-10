"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isFirebaseClientConfigured();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return setError("Firebase 환경 변수를 먼저 설정해 주세요.");
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      router.replace("/dashboard");
    } catch {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 space-y-4">
    <label className="block text-sm font-medium">이메일<input type="email" required autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-[#dce3de] px-3 py-3" placeholder="teacher@school.kr"/></label>
    <label className="block text-sm font-medium">비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-[#dce3de] px-3 py-3" placeholder="••••••••"/></label>
    {error && <p role="alert" className="rounded-xl bg-[#fff1ee] p-3 text-sm text-[#a13f35]">{error}</p>}
    <button disabled={busy} className="focus-ring w-full rounded-xl bg-[#1f6b4f] px-4 py-3 font-semibold text-white hover:bg-[#18553f] disabled:opacity-60">{busy ? "로그인 중…" : "로그인"}</button>
    <div className="flex justify-between text-sm"><Link className="text-[#1f6b4f] hover:underline" href="/reset-password">비밀번호 재설정</Link><Link className="text-[#6d7772] hover:underline" href="/dashboard">데모 화면 보기</Link></div>
  </form>;
}
