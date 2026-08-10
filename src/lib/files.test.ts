import { describe, expect, it } from "vitest";
import { sanitizeFilename, validatePdfFile } from "./files";

describe("sanitizeFilename", () => {
  it("Windows 금지 문자를 안전하게 바꾼다", () => {
    expect(sanitizeFilename('중간고사:1/2?*.hwpx')).toBe("중간고사_1_2__.hwpx");
  });

  it("비어 있는 이름에는 기본값을 쓴다", () => {
    expect(sanitizeFilename("... ")).toBe("문제지");
  });
});

describe("validatePdfFile", () => {
  it("PDF MIME을 허용한다", () => {
    expect(validatePdfFile({ name: "시험.pdf", type: "application/pdf", size: 1024 }).ok).toBe(true);
  });

  it("크기 제한을 검사한다", () => {
    const result = validatePdfFile({ name: "시험.pdf", type: "application/pdf", size: 51 * 1024 * 1024 });
    expect(result.ok).toBe(false);
  });
});
