import { LoginForm } from "@/components/common/login-form";

export default function LoginPage() {
  return <main className="shell" style={{ display: "grid", placeItems: "center", padding: 24 }}>
    <section className="card" style={{ width: "min(440px, 100%)", padding: "36px" }}>
      <p style={{ color: "#315be8", fontWeight: 800, marginTop: 0 }}>QUIZ DB MAKER</p>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>교사용 도구 로그인</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: 28 }}>PDF 원문과 API 키를 안전하게 보호하기 위해 관리자 확인이 필요합니다.</p>
      <LoginForm />
    </section>
  </main>;
}
