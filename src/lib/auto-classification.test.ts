import { describe, expect, it } from "vitest";
import { createDefaultClassificationData } from "./classification";
import {
  buildMiddleUnitCandidates,
  classifyQuestionLocally,
  inferSubjectIdFromFileName,
} from "./auto-classification";

describe("automatic middle-unit classification", () => {
  const data = createDefaultClassificationData();

  it("infers the subject from a PDF file name", () => {
    expect(inferSubjectIdFromFileName(data, "한국사2-산업화와 경제성장.pdf"))
      .toBe("subject-history-2");
  });

  it("classifies a clear industrialization question locally", () => {
    const candidates = buildMiddleUnitCandidates(data, "subject-history-2");
    const result = classifyQuestionLocally({
      questionKey: "q-1",
      questionNumber: "1",
      questionText: "박정희 정부는 서독에 광부와 간호사를 파견하여 외화를 획득하였다.",
      answerText: "정답: 서독",
      explanationText: "경제 개발 5개년 계획과 수출 주도 산업화 과정에서 외화를 확보하였다.",
    }, candidates);

    expect(result.candidates[0].categoryName).toBe("산업화의 성과와 사회·환경 문제");
    expect(result.isConfident).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("keeps a low-evidence question for Gemini review", () => {
    const candidates = buildMiddleUnitCandidates(data, "subject-history-2");
    const result = classifyQuestionLocally({
      questionKey: "q-2",
      questionNumber: "2",
      questionText: "다음 자료를 읽고 가장 적절한 설명을 고르시오.",
      answerText: "정답 ③",
      explanationText: "",
    }, candidates);

    expect(result.isConfident).toBe(false);
  });

  it("uses confirmed examples as local learning evidence", () => {
    const candidates = buildMiddleUnitCandidates(data, "subject-history-2");
    const category = candidates.find((candidate) => candidate.name === "산업화의 성과와 사회·환경 문제");
    expect(category).toBeDefined();
    const result = classifyQuestionLocally({
      questionKey: "q-new",
      questionNumber: "9",
      questionText: "해외 인력 파견으로 외화를 벌어들인 정책을 묻는 문항이다.",
      answerText: "서독",
      explanationText: "해외 취업 노동자의 송금은 경제 성장의 밑거름이 되었다.",
    }, candidates, [{
      questionCardId: "doc:q-old",
      questionKey: "q-old",
      questionNumber: "1",
      questionText: "해외 인력 파견으로 외화를 벌어들였다.",
      answerText: "서독",
      explanationText: "해외 취업 노동자의 송금은 경제 성장의 밑거름이었다.",
      subjectId: "subject-history-2",
      categoryId: category!.id,
    }]);

    expect(result.candidates[0].categoryId).toBe(category!.id);
    expect(result.candidates[0].score).toBeGreaterThan(0);
  });
});
