import { describe, expect, it } from "vitest";
import type { EditableRegion, PdfPageTextContent } from "./question-detection";
import { extractReviewedQuestionTexts } from "./question-text-extraction";

const page: PdfPageTextContent = {
  pageNumber: 1,
  pageWidth: 1000,
  pageHeight: 1400,
  fragments: [
    { text: "1. 경제 개발 계획에 대한 설명은?", x: 100, y: 100, width: 300, height: 20 },
    { text: "수출 주도 산업화", x: 100, y: 150, width: 180, height: 20 },
    { text: "정답 ②", x: 100, y: 430, width: 80, height: 20 },
    { text: "해설 경제 개발 5개년 계획", x: 100, y: 510, width: 240, height: 20 },
    { text: "영역 밖 문장", x: 700, y: 100, width: 120, height: 20 },
  ],
};

function region(overrides: Partial<EditableRegion>): EditableRegion {
  return {
    id: crypto.randomUUID(),
    questionKey: "q-1",
    questionNumber: "1",
    pageNumber: 1,
    xRatio: 0.08,
    yRatio: 0.05,
    widthRatio: 0.4,
    heightRatio: 0.2,
    regionType: "question",
    sortOrder: 0,
    status: "reviewed",
    ...overrides,
  };
}

describe("reviewed question text extraction", () => {
  it("extracts question, answer, and explanation text from their own regions", () => {
    const result = extractReviewedQuestionTexts([page], [
      region({}),
      region({ id: "a", regionType: "answer", yRatio: 0.28, heightRatio: 0.08 }),
      region({ id: "e", regionType: "explanation", yRatio: 0.34, heightRatio: 0.12 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].questionText).toContain("수출 주도 산업화");
    expect(result[0].questionText).not.toContain("영역 밖");
    expect(result[0].answerText).toBe("정답 ②");
    expect(result[0].explanationText).toContain("경제 개발 5개년 계획");
  });

  it("ignores regions that have not been reviewed", () => {
    expect(extractReviewedQuestionTexts([page], [region({ status: "needs_review" })])).toEqual([]);
  });
});
