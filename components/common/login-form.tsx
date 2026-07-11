"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setPending(false);
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.message ?? "로그인하지 못했습니다."); return; }
    router.replace("/"); router.refresh();
  }

  return <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
    <label htmlFor="password" style={{ fontWeight: 700 }}>관리자 비밀번호</label>
    <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
    {error && <p role="alert" style={{ margin: 0, color: "#b42318" }}>{error}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "확인 중…" : "로그인"}</button>
  </form>;
}
