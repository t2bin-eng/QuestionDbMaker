const WINDOWS_RESERVED = /[<>:"/\\|?*\u0000-\u001F]/g;

export function sanitizeFilename(value: string, fallback = "문제지") {
  const sanitized = value.replace(WINDOWS_RESERVED, "_").replace(/[. ]+$/g, "").trim();
  return sanitized || fallback;
}

export function validatePdfFile(file: Pick<File, "name" | "size" | "type">, maxMb = 50) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false as const, message: "PDF 파일만 업로드할 수 있습니다." };
  }
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false as const, message: `파일 크기는 ${maxMb}MB 이하여야 합니다.` };
  }
  return { ok: true as const };
}
