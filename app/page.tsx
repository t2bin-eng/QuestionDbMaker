import { UploadPanel } from "@/components/pdf/upload-panel";
import { getServerEnv } from "@/lib/env";

export default function HomePage() {
  const env = getServerEnv();
  return <main className="shell">
    <header className="container" style={{ padding: "24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>Quiz DB Maker</strong><span style={{ color: "var(--muted)", fontSize: 14 }}>교사용 PDF 변환 도구</span></header>
    <section className="container" style={{ padding: "54px 0 72px" }}>
      <div style={{ maxWidth: 760, marginBottom: 34 }}><p style={{ color: "#315be8", fontWeight: 800 }}>PDF → 검토 → EXCEL</p><h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.08, margin: "0 0 18px" }}>문제지는 그대로,<br/>DB 작업은 더 빠르게.</h1><p style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.7 }}>문항 구조를 추출한 뒤 교사가 직접 검토하고, 기존 퀴즈 게임용 10열 Excel로 내보냅니다.</p></div>
      {!env.success && <div role="alert" className="card" style={{ padding: 18, marginBottom: 22, borderColor: "#f6b9b2", background: "#fff8f7" }}><strong>서버 설정이 필요합니다.</strong><p style={{ marginBottom: 0 }}>APP_ADMIN_PASSWORD(8자 이상)와 AUTH_SECRET(32자 이상)을 Vercel 환경 변수 또는 .env.local에 설정하세요.</p></div>}
      <div className="card" style={{ padding: "clamp(18px, 4vw, 38px)" }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}><UploadPanel/><UploadPanel optional/></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginTop: 24 }}>
        {[['텍스트형 PDF 권장','스캔 PDF는 후속 단계에서 이미지 분석 후 검토 표시합니다.'],['4지·5지선다 지원','선택지와 정답 순서를 원본 그대로 보존합니다.'],['원문 비영구 저장','기본 모드에서는 PDF를 서버에 장기 보관하지 않습니다.'],['교사 검토 필수','AI 결과를 자동 확정하거나 정답을 추측하지 않습니다.']].map(([title,body]) => <article key={title} className="card" style={{ padding: 20 }}><strong>{title}</strong><p style={{ color: "var(--muted)", lineHeight: 1.55, marginBottom: 0 }}>{body}</p></article>)}
      </div>
    </section>
  </main>;
}
