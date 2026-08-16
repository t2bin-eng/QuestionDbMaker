import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDefaultClassificationData } from "./classification";
import type { LocalQuestionCardSummary } from "./local-file-store";
import {
  assessCodexClassificationResult,
  buildCodexClassificationTaskArchive,
  CODEX_CLASSIFICATION_RESULT_FORMAT,
  parseCodexClassificationResult,
} from "./codex-classification-exchange";

const classificationData = createDefaultClassificationData();
const subject = classificationData.subjects.find((item) => item.name === "한국사2")!;
const category = classificationData.categories.find((item) =>
  item.subjectId === subject.id && item.name === "민주화를 위한 노력")!;
const card: LocalQuestionCardSummary = {
  id: "document-1:question-1",
  documentId: "document-1",
  questionKey: "question-1",
  sourceQuestionNumber: "1",
  sourceName: "한국사.pdf",
  updatedAt: "2026-08-16T00:00:00.000Z",
  classification: null,
  regions: [{ pageNumber: 1, xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1, sortOrder: 0 }],
};

describe("Codex classification exchange", () => {
  it("builds a ZIP with Markdown, JSON, a result template, and question images", () => {
    const archive = buildCodexClassificationTaskArchive({
      taskId: "task-1",
      generatedAt: "2026-08-16T00:00:00.000Z",
      classificationData,
      questions: [{
        questionCardId: card.id,
        sourceName: card.sourceName,
        questionNumber: card.sourceQuestionNumber,
        questionText: "박정희 정부 시기의 장발과 미니스커트 단속",
        answerText: "사회 통제",
        explanationText: "유신 체제 시기의 모습이다.",
        imagePath: "images/question-0001.jpg",
        currentClassification: null,
      }],
      images: { "images/question-0001.jpg": new Uint8Array([1, 2, 3]) },
    });
    const files = unzipSync(archive.bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      "classification-task.md",
      "task.json",
      "classification-result.template.json",
      "images/question-0001.jpg",
    ]));
    expect(strFromU8(files["classification-task.md"])).toContain("문항 카드 중단원 분류 작업");
    expect(strFromU8(files["classification-task.md"])).toContain(category.id);
  });

  it("parses JSON inside a Markdown code fence and rejects duplicate IDs", () => {
    const payload = {
      version: 1,
      format: CODEX_CLASSIFICATION_RESULT_FORMAT,
      taskId: "task-1",
      generatedAt: "2026-08-16T00:00:00.000Z",
      classifications: [{
        questionCardId: card.id,
        subjectId: subject.id,
        categoryId: category.id,
        confidence: 0.94,
        reason: "박정희 정부의 사회 통제",
      }],
    };
    expect(parseCodexClassificationResult(`결과입니다.\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``).taskId)
      .toBe("task-1");
    expect(() => parseCodexClassificationResult(JSON.stringify({
      ...payload,
      classifications: [...payload.classifications, ...payload.classifications],
    }))).toThrow("중복된 문항 ID");
  });

  it("accepts active middle units and protects manually confirmed classifications", () => {
    const result = parseCodexClassificationResult(JSON.stringify({
      version: 1,
      format: CODEX_CLASSIFICATION_RESULT_FORMAT,
      taskId: "task-1",
      generatedAt: "2026-08-16T00:00:00.000Z",
      classifications: [{
        questionCardId: card.id,
        subjectId: subject.id,
        categoryId: category.id,
        confidence: 0.9,
        reason: "박정희 정부의 사회 통제",
      }],
    }));
    expect(assessCodexClassificationResult(result, [card], classificationData)[0].status).toBe("apply");
    const manualCard = {
      ...card,
      classification: {
        subjectId: subject.id,
        categoryId: category.id,
        difficultyOptionId: null,
        questionTypeOptionId: null,
        tagIds: [],
        origin: "manual" as const,
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    };
    expect(assessCodexClassificationResult(result, [manualCard], classificationData)[0].status)
      .toBe("protected");
  });

  it("keeps null classifications for review and rejects non-middle category IDs", () => {
    const base = {
      version: 1,
      format: CODEX_CLASSIFICATION_RESULT_FORMAT,
      taskId: "task-1",
      generatedAt: "2026-08-16T00:00:00.000Z",
    } as const;
    const review = parseCodexClassificationResult(JSON.stringify({
      ...base,
      classifications: [{
        questionCardId: card.id,
        subjectId: subject.id,
        categoryId: null,
        confidence: 0.4,
        reason: "시대 근거가 부족함",
      }],
    }));
    expect(assessCodexClassificationResult(review, [card], classificationData)[0].status).toBe("review");
    const major = classificationData.categories.find((item) =>
      item.subjectId === subject.id && item.categoryType === "major")!;
    const invalid = parseCodexClassificationResult(JSON.stringify({
      ...base,
      classifications: [{
        questionCardId: card.id,
        subjectId: subject.id,
        categoryId: major.id,
        confidence: 0.9,
        reason: "중단원이 아닌 대단원을 반환",
      }],
    }));
    expect(assessCodexClassificationResult(invalid, [card], classificationData)[0].status).toBe("invalid");
  });
});
