import { describe, expect, it, vi } from "vitest";
import {
  detectDocumentQuestionRegions,
  detectQuestionRegions,
  groupTextFragmentsIntoLines,
  hasExtractableText,
} from "./question-detection";

vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "region-id") });

describe("question detection", () => {
  it("groups nearby fragments into reading lines", () => {
    const lines = groupTextFragmentsIntoLines([
      { text: "1.", x: 20, y: 40, width: 12, height: 10 },
      { text: "다음", x: 36, y: 41, width: 24, height: 10 },
      { text: "2.", x: 20, y: 120, width: 12, height: 10 },
    ]);
    expect(lines.map((line) => line.text)).toEqual(["1. 다음", "2."]);
  });

  it("does not merge text across the center column gutter", () => {
    const lines = groupTextFragmentsIntoLines([
      { text: "④ 왼쪽 칼럼의 긴 문장", x: 25, y: 320, width: 250, height: 9 },
      { text: "16.", x: 321, y: 318, width: 14, height: 9 },
      { text: "오른쪽 문항", x: 337, y: 318, width: 80, height: 9 },
    ], 600);

    expect(lines.map((line) => line.text).sort()).toEqual([
      "16. 오른쪽 문항",
      "④ 왼쪽 칼럼의 긴 문장",
    ].sort());
  });

  it("creates a region from each numbered question line", () => {
    const regions = detectQuestionRegions([
      { text: "1.", x: 20, y: 40, width: 12, height: 10 },
      { text: "문항", x: 36, y: 40, width: 25, height: 10 },
      { text: "2.", x: 20, y: 160, width: 12, height: 10 },
      { text: "문항", x: 36, y: 160, width: 25, height: 10 },
    ], 1, 600, 800);

    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ questionNumber: "1", pageNumber: 1, status: "auto_detected" });
    expect(regions[0].heightRatio).toBeGreaterThan(0.1);
  });

  it("does not treat answer-rate decimals as question numbers", () => {
    const regions = detectQuestionRegions([
      { text: "1.", x: 20, y: 40, width: 12, height: 10 },
      { text: "옳은 것은?", x: 36, y: 40, width: 60, height: 10 },
      { text: "① 선택지", x: 20, y: 90, width: 60, height: 10 },
      { text: "정답률", x: 20, y: 120, width: 30, height: 8 },
      { text: "43.2%", x: 80, y: 140, width: 30, height: 7.5 },
      { text: "29.3%", x: 150, y: 140, width: 30, height: 7.5 },
    ], 1, 600, 800);

    expect(regions.map((region) => region.questionNumber)).toEqual(["1"]);
  });

  it("ends a question region before its answer table", () => {
    const regions = detectQuestionRegions([
      { text: "1.", x: 20, y: 100, width: 12, height: 10 },
      { text: "옳은 것은?", x: 36, y: 100, width: 60, height: 10 },
      { text: "① 선택지", x: 20, y: 180, width: 60, height: 10 },
      { text: "정답", x: 20, y: 260, width: 24, height: 8 },
      { text: "정답률", x: 60, y: 260, width: 32, height: 8 },
      { text: "해설", x: 20, y: 340, width: 24, height: 9 },
    ], 1, 600, 800);

    expect(regions).toHaveLength(1);
    expect(regions[0].yRatio + regions[0].heightRatio).toBeLessThan(0.34);
  });

  it("keeps left and right column questions separate", () => {
    const regions = detectQuestionRegions([
      { text: "1.", x: 25, y: 110, width: 12, height: 9 },
      { text: "옳은 것은?", x: 40, y: 110, width: 70, height: 9 },
      { text: "① 선택지", x: 25, y: 180, width: 60, height: 9 },
      { text: "2.", x: 320, y: 130, width: 12, height: 9 },
      { text: "적절한 것은?", x: 335, y: 130, width: 75, height: 9 },
      { text: "① 선택지", x: 320, y: 200, width: 60, height: 9 },
    ], 1, 595, 842);

    expect(regions).toHaveLength(2);
    expect(regions[0].xRatio + regions[0].widthRatio).toBeLessThan(0.52);
    expect(regions[1].xRatio).toBeGreaterThan(0.5);
  });

  it("keeps a wider safety margin around left-column content", () => {
    const regions = detectQuestionRegions([
      { text: "19. 옳은 것은?", x: 20, y: 110, width: 100, height: 10 },
      { text: "⑤ 오른쪽 끝의 긴 선택지", x: 22, y: 210, width: 270, height: 9 },
      { text: "20. 다음 문제", x: 320, y: 130, width: 100, height: 10 },
    ], 1, 600, 800);

    const left = regions.find((region) => region.questionNumber === "19")!;
    expect(left.xRatio * 600).toBeLessThanOrEqual(6);
    expect((left.xRatio + left.widthRatio) * 600).toBeGreaterThan(290);
    expect((left.xRatio + left.widthRatio) * 600).toBeLessThan(320);
  });

  it("keeps a final choice before an early answer block as a question continuation", () => {
    const regions = detectDocumentQuestionRegions([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "4. 옳은 것은?", x: 25, y: 700, width: 100, height: 10 },
          { text: "④ 네 번째 선택지", x: 25, y: 750, width: 100, height: 9 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "⑤ 다섯 번째 선택지", x: 25, y: 42, width: 110, height: 9 },
          { text: "정답 ①", x: 25, y: 78, width: 55, height: 9 },
          { text: "해설", x: 25, y: 110, width: 25, height: 9 },
          { text: "5. 다음 문제는?", x: 25, y: 260, width: 110, height: 10 },
        ],
      },
    ]);

    const questionFour = regions.filter((region) =>
      region.questionNumber === "4" && region.regionType === "question",
    );
    expect(questionFour).toHaveLength(2);
    expect(questionFour[1].pageNumber).toBe(2);
    expect(questionFour[1].yRatio).toBeLessThan(0.03);
    expect((questionFour[1].yRatio + questionFour[1].heightRatio) * 800).toBeLessThan(78);
  });

  it("uses text density to keep a page two-column when only one marker is found", () => {
    const fragments = [
      { text: "15.", x: 25, y: 360, width: 14, height: 9 },
      { text: "옳은 것은?", x: 42, y: 360, width: 70, height: 9 },
      ...Array.from({ length: 6 }, (_, index) => ({
        text: `왼쪽 내용 ${index}`,
        x: 25,
        y: 100 + index * 20,
        width: 90,
        height: 9,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        text: `오른쪽 내용 ${index}`,
        x: 321,
        y: 100 + index * 20,
        width: 90,
        height: 9,
      })),
    ];
    const regions = detectQuestionRegions(fragments, 1, 600, 800);

    expect(regions).toHaveLength(1);
    expect(regions[0].xRatio + regions[0].widthRatio).toBeLessThan(0.52);
  });

  it("keeps the dominant two-column width on a sparse final page", () => {
    const twoColumnPage = (pageNumber: number, leftNumber: number, rightNumber: number) => ({
      pageNumber,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: `${leftNumber}. 옳은 것은?`, x: 25, y: 120, width: 100, height: 10 },
        { text: "① 선택지", x: 25, y: 220, width: 60, height: 9 },
        { text: `${rightNumber}. 적절한 것은?`, x: 320, y: 130, width: 110, height: 10 },
        { text: "① 선택지", x: 320, y: 230, width: 60, height: 9 },
      ],
    });
    const regions = detectDocumentQuestionRegions([
      twoColumnPage(1, 1, 2),
      twoColumnPage(2, 3, 4),
      {
        pageNumber: 3,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "5. 옳은 것은?", x: 25, y: 120, width: 100, height: 10 },
          { text: "① 선택지", x: 25, y: 220, width: 60, height: 9 },
          { text: "6. 적절한 것은?", x: 25, y: 430, width: 110, height: 10 },
          { text: "① 선택지", x: 25, y: 530, width: 60, height: 9 },
        ],
      },
    ]);

    const finalPageRegions = regions.filter((region) => region.pageNumber === 3 && region.sortOrder === 0);
    expect(finalPageRegions).toHaveLength(2);
    expect(finalPageRegions.every((region) => region.xRatio + region.widthRatio < 0.52)).toBe(true);
    expect(finalPageRegions.every((region) => region.detectionReasons?.includes("문서 2단 레이아웃 유지"))).toBe(true);
  });

  it("starts a first-page continuation below the first question header line", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "학교 시험 안내", x: 320, y: 20, width: 100, height: 10 },
        { text: "1. 옳은 것은?", x: 25, y: 116, width: 100, height: 10 },
        { text: "① 선택지", x: 25, y: 220, width: 60, height: 9 },
        { text: "2. 다음 자료를 보시오", x: 25, y: 637, width: 130, height: 10 },
        { text: "이어지는 자료", x: 320, y: 112, width: 90, height: 10 },
        { text: "① 선택지", x: 320, y: 240, width: 60, height: 9 },
        { text: "3. 적절한 것은?", x: 320, y: 576, width: 110, height: 10 },
      ],
    }]);

    const continuation = regions.find((region) => region.questionNumber === "2" && region.sortOrder === 1);
    expect(continuation).toBeDefined();
    expect(continuation!.yRatio).toBeGreaterThanOrEqual(0.12);
    expect(continuation!.yRatio).toBeLessThan(0.15);
    expect(continuation!.detectionReasons).toContain("첫 문항 시작선 적용");
  });

  it("lowers confidence for a full-width question inside a two-column document", () => {
    const regions = detectDocumentQuestionRegions([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "1. 옳은 것은?", x: 25, y: 120, width: 100, height: 10 },
          { text: "2. 적절한 것은?", x: 320, y: 130, width: 110, height: 10 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "3. 옳은 것은?", x: 25, y: 120, width: 100, height: 10 },
          { text: "① 선택지", x: 25, y: 220, width: 60, height: 9 },
        ],
      },
      {
        pageNumber: 3,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "4. 옳은 것은?", x: 25, y: 120, width: 100, height: 10 },
          { text: "5. 적절한 것은?", x: 320, y: 130, width: 110, height: 10 },
        ],
      },
    ]);

    const middlePageRegion = regions.find((region) => region.questionNumber === "3" && region.sortOrder === 0);
    expect(middlePageRegion).toMatchObject({ status: "needs_review" });
    expect(middlePageRegion!.detectionConfidence).toBeLessThanOrEqual(0.55);
    expect(middlePageRegion!.detectionReasons).toContain("문서 2단 레이아웃과 영역 너비 불일치");
  });

  it("does not treat numbered list items inside a question as new questions", () => {
    const regions = detectQuestionRegions([
      { text: "7.", x: 25, y: 480, width: 12, height: 10 },
      { text: "옳은 것은?", x: 40, y: 480, width: 70, height: 10 },
      { text: "1.", x: 30, y: 510, width: 10, height: 9 },
      { text: "본문 안 첫 번째 항목", x: 44, y: 510, width: 100, height: 9 },
      { text: "2.", x: 30, y: 550, width: 10, height: 9 },
      { text: "본문 안 두 번째 항목", x: 44, y: 550, width: 100, height: 9 },
      { text: "3.", x: 30, y: 590, width: 10, height: 9 },
      { text: "본문 안 세 번째 항목", x: 44, y: 590, width: 100, height: 9 },
      { text: "① 선택지", x: 25, y: 650, width: 70, height: 9 },
      { text: "8.", x: 25, y: 720, width: 12, height: 10 },
      { text: "다음 문제는?", x: 40, y: 720, width: 80, height: 10 },
    ], 4, 600, 842);

    expect(regions.map((region) => region.questionNumber)).toEqual(["7", "8"]);
  });

  it("links a question from the left column into the right column", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "2.", x: 20, y: 640, width: 12, height: 10 },
        { text: "옳은 것은?", x: 36, y: 640, width: 60, height: 10 },
        { text: "자료", x: 320, y: 100, width: 40, height: 10 },
        { text: "① 선택지", x: 320, y: 180, width: 60, height: 10 },
        { text: "정답", x: 320, y: 500, width: 24, height: 9 },
        { text: "3.", x: 320, y: 690, width: 12, height: 10 },
        { text: "결과는?", x: 336, y: 690, width: 50, height: 10 },
      ],
    }]);

    const questionTwo = regions.filter((region) => region.questionNumber === "2" && region.regionType === "question");
    expect(questionTwo).toHaveLength(2);
    expect(questionTwo.map((region) => region.pageNumber)).toEqual([1, 1]);
    expect(questionTwo[1].xRatio).toBeGreaterThan(0.5);
    expect(questionTwo[1].yRatio + questionTwo[1].heightRatio).toBeLessThan(0.64);
  });

  it("does not link a question onto an answer block at the top of the next column", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "7.", x: 20, y: 520, width: 12, height: 10 },
        { text: "옳은 것은?", x: 36, y: 520, width: 60, height: 10 },
        { text: "① 선택지", x: 20, y: 750, width: 60, height: 10 },
        { text: "정답", x: 320, y: 55, width: 24, height: 9 },
        { text: "정답률", x: 360, y: 55, width: 32, height: 9 },
        { text: "해설", x: 320, y: 120, width: 24, height: 9 },
        { text: "8.", x: 320, y: 300, width: 12, height: 10 },
        { text: "옳은 것은?", x: 336, y: 300, width: 60, height: 10 },
      ],
    }]);

    expect(regions.filter((region) => region.questionNumber === "7" && region.regionType === "question")).toHaveLength(1);
    expect(regions.filter((region) => region.questionNumber === "7" && region.regionType === "answer")).toHaveLength(1);
    expect(regions.filter((region) => region.questionNumber === "7" && region.regionType === "explanation")).toHaveLength(1);
  });

  it("keeps choices near the page footer inside the source region", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "7.", x: 20, y: 520, width: 12, height: 10 },
        { text: "옳은 것은?", x: 36, y: 520, width: 60, height: 10 },
        { text: "① 선택지", x: 20, y: 750, width: 60, height: 10 },
        { text: "1 / 36", x: 285, y: 785, width: 30, height: 8 },
        { text: "정답", x: 320, y: 55, width: 24, height: 9 },
        { text: "8.", x: 320, y: 300, width: 12, height: 10 },
        { text: "옳은 것은?", x: 336, y: 300, width: 60, height: 10 },
      ],
    }]);

    const questionSeven = regions.find((region) => region.questionNumber === "7");
    expect(questionSeven).toBeDefined();
    expect((questionSeven!.yRatio + questionSeven!.heightRatio) * 800).toBeGreaterThan(760);
  });

  it("links a bottom-right question into the next page", () => {
    const regions = detectDocumentQuestionRegions([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "2.", x: 20, y: 620, width: 12, height: 10 },
          { text: "옳은 것은?", x: 36, y: 620, width: 60, height: 10 },
          { text: "3.", x: 320, y: 690, width: 12, height: 10 },
          { text: "결과는?", x: 336, y: 690, width: 50, height: 10 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "이어지는 자료", x: 20, y: 90, width: 80, height: 10 },
          { text: "① 선택지", x: 20, y: 160, width: 60, height: 10 },
          { text: "정답", x: 20, y: 250, width: 24, height: 9 },
          { text: "4.", x: 20, y: 400, width: 12, height: 10 },
          { text: "옳은 것은?", x: 36, y: 400, width: 60, height: 10 },
          { text: "5.", x: 320, y: 420, width: 12, height: 10 },
          { text: "적절한 것은?", x: 336, y: 420, width: 70, height: 10 },
        ],
      },
    ]);

    const questionThree = regions.filter((region) => region.questionNumber === "3" && region.regionType === "question");
    expect(questionThree).toHaveLength(2);
    expect(questionThree.map((region) => region.pageNumber)).toEqual([1, 2]);
    expect(questionThree[1].xRatio).toBeLessThan(0.1);
    expect(questionThree[1].yRatio + questionThree[1].heightRatio).toBeLessThan(0.34);
    expect(questionThree[1].yRatio).toBeLessThan(0.03);
  });

  it("finds an asymmetric two-column boundary from the actual right-column anchor", () => {
    const regions = detectQuestionRegions([
      { text: "21. 옳은 것은?", x: 28, y: 110, width: 120, height: 10 },
      { text: "① 선택지", x: 28, y: 170, width: 80, height: 9 },
      { text: "22. 적절한 것은?", x: 382, y: 120, width: 130, height: 10 },
      { text: "① 선택지", x: 382, y: 180, width: 80, height: 9 },
    ], 1, 600, 800);

    expect(regions).toHaveLength(2);
    expect(regions[0].xRatio + regions[0].widthRatio).toBeLessThan(0.62);
    expect(regions[1].xRatio).toBeGreaterThan(0.6);
  });

  it("removes repeated exam headers before detecting question markers", () => {
    const pages = [1, 2].map((pageNumber) => ({
      pageNumber,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: `${pageNumber}. 2026학년도 시험 문제`, x: 20, y: 45, width: 150, height: 10 },
        { text: `${pageNumber + 10}. 옳은 것은?`, x: 25, y: 180, width: 100, height: 10 },
        { text: "① 선택지", x: 25, y: 250, width: 60, height: 9 },
        { text: "2026학년도 학교 시험", x: 220, y: 770, width: 150, height: 8 },
      ],
    }));

    const regions = detectDocumentQuestionRegions(pages);
    expect(regions.filter((region) => region.sortOrder === 0).map((region) => region.questionNumber))
      .toEqual(["11", "12"]);
    expect(regions.every((region) => region.yRatio + region.heightRatio < 0.96)).toBe(true);
  });

  it("keeps a visual-only continuation at the top of the next page", () => {
    const regions = detectDocumentQuestionRegions([
      {
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "1. 다음 그림을 보시오", x: 25, y: 700, width: 120, height: 10 },
        ],
      },
      {
        pageNumber: 2,
        pageWidth: 600,
        pageHeight: 800,
        fragments: [
          { text: "2. 옳은 것은?", x: 25, y: 420, width: 100, height: 10 },
          { text: "① 선택지", x: 25, y: 500, width: 60, height: 9 },
        ],
        visuals: [
          { x: 40, y: 70, width: 240, height: 230, kind: "image" as const },
        ],
      },
    ]);

    const questionOne = regions.filter((region) => region.questionNumber === "1");
    expect(questionOne).toHaveLength(2);
    expect(questionOne[1].pageNumber).toBe(2);
    expect(questionOne[1].heightRatio).toBeGreaterThan(0.3);
  });

  it("links answer and explanation regions to the preceding question", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "1. 옳은 것은?", x: 25, y: 100, width: 100, height: 10 },
        { text: "① 선택지", x: 25, y: 180, width: 60, height: 9 },
        { text: "정답 ①", x: 25, y: 245, width: 60, height: 9 },
        { text: "해설", x: 25, y: 285, width: 25, height: 9 },
        { text: "정답의 근거가 되는 설명", x: 25, y: 320, width: 150, height: 9 },
        { text: "2. 적절한 것은?", x: 25, y: 430, width: 110, height: 10 },
        { text: "① 선택지", x: 25, y: 500, width: 60, height: 9 },
      ],
    }]);

    const firstQuestionRegions = regions.filter((region) => region.questionNumber === "1");
    expect(firstQuestionRegions.map((region) => region.regionType)).toEqual([
      "question",
      "answer",
      "explanation",
    ]);
    expect(new Set(firstQuestionRegions.map((region) => region.questionKey)).size).toBe(1);
    expect(firstQuestionRegions.find((region) => region.regionType === "question")!.heightRatio)
      .toBeLessThan(firstQuestionRegions.find((region) => region.regionType === "answer")!.yRatio);
  });

  it("keeps a cross-column '정답 찾기' heading inside the explanation", () => {
    const regions = detectDocumentQuestionRegions([{
      pageNumber: 6,
      pageWidth: 600,
      pageHeight: 800,
      fragments: [
        { text: "20. 다음 변화의 배경으로 옳은 것은?", x: 25, y: 500, width: 210, height: 10 },
        { text: "① 선택지", x: 25, y: 650, width: 60, height: 9 },
        { text: "정답 ②", x: 140, y: 750, width: 55, height: 9 },
        { text: "해설", x: 320, y: 50, width: 25, height: 9 },
        { text: "정답 찾기 한국 경제는 성장하였다.", x: 320, y: 80, width: 190, height: 9 },
        { text: "오답 피하기 선택지의 근거를 확인한다.", x: 320, y: 130, width: 210, height: 9 },
        { text: "21. 빈칸에 들어갈 말은?", x: 320, y: 200, width: 150, height: 10 },
        { text: "① 선택지", x: 320, y: 260, width: 60, height: 9 },
      ],
    }]);

    const questionTwenty = regions.filter((region) => region.questionNumber === "20");
    const rightColumnAnswers = questionTwenty.filter((region) =>
      region.regionType === "answer" && region.xRatio > 0.5,
    );
    const explanation = questionTwenty.find((region) => region.regionType === "explanation");

    expect(rightColumnAnswers).toHaveLength(0);
    expect(explanation).toBeDefined();
    expect(explanation!.yRatio * 800).toBeLessThan(60);
    expect((explanation!.yRatio + explanation!.heightRatio) * 800).toBeGreaterThan(180);
  });

  it("marks image-only pages as not extractable", () => {
    expect(hasExtractableText([])).toBe(false);
    expect(hasExtractableText([{ text: "짧음", x: 0, y: 0, width: 1, height: 1 }])).toBe(false);
  });
});
