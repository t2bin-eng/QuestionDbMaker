import { describe, expect, it } from "vitest";
import type { QuestionTextRecord } from "./auto-classification";
import { shouldRunQuestionOcr } from "./browser-question-ocr";
import type { EditableRegion, PdfPageTextContent } from "./question-detection";

const region: EditableRegion = {
  id: "r1",
  questionKey: "q-42",
  questionNumber: "42",
  pageNumber: 1,
  xRatio: 0.1,
  yRatio: 0.1,
  widthRatio: 0.4,
  heightRatio: 0.3,
  regionType: "question",
  sortOrder: 0,
  status: "reviewed",
};

const baseRecord: QuestionTextRecord = {
  questionKey: "q-42",
  questionNumber: "42",
  questionText: "다음 우표를 발행하였던 정부 시기에 있었던 사실로 옳은 것은?",
  answerText: "정답 ①",
  explanationText: "",
};

describe("browser question OCR targeting", () => {
  it("OCRs a short question that contains a visual source", () => {
    const page: PdfPageTextContent = {
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      fragments: [],
      visuals: [{ x: 160, y: 200, width: 240, height: 120, kind: "image" }],
    };
    expect(shouldRunQuestionOcr(baseRecord, [region], new Map([[1, page]]))).toBe(true);
  });

  it("skips OCR for a text-rich question without visual content", () => {
    const page: PdfPageTextContent = {
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      fragments: [],
      visuals: [],
    };
    const record = { ...baseRecord, questionText: "대한민국의 산업화 과정에서 실시된 경제 정책과 그 결과를 설명하는 긴 자료이다. ".repeat(5) };
    expect(shouldRunQuestionOcr(record, [region], new Map([[1, page]]))).toBe(false);
  });
});
