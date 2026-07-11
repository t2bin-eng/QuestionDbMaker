"use client";

import { useRef, useState } from "react";

export function UploadPanel({ optional = false }: { optional?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  return <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.type === "application/pdf") setName(file.name); }} style={{ border: "2px dashed #b8c5dd", borderRadius: 18, padding: 28, textAlign: "center", background: "#fbfcff" }}>
    <input ref={input} aria-label={optional ? "정답·해설 PDF" : "문제지 PDF"} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
    <div aria-hidden style={{ fontSize: 30 }}>↥</div>
    <h3 style={{ margin: "8px 0" }}>{optional ? "정답·해설 PDF" : "문제지 PDF"}</h3>
    <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>{name || "PDF를 끌어놓거나 파일을 선택하세요."}</p>
    <button type="button" className="button button-secondary" onClick={() => input.current?.click()}>파일 선택</button>
  </div>;
}
