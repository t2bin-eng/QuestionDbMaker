"use client";

import { strToU8, zipSync, type Zippable } from "fflate";
import { z } from "zod";
import type { ClassificationData } from "./classification";
import type { LocalQuestionCardSummary } from "./local-file-store";

export const CODEX_CLASSIFICATION_TASK_FORMAT = "question-card-studio-codex-classification-task";
export const CODEX_CLASSIFICATION_RESULT_FORMAT = "question-card-studio-codex-classification-result";

export interface CodexTaskQuestion {
  questionCardId: string;
  sourceName: string;
  questionNumber: string | null;
  questionText: string;
  answerText: string;
  explanationText: string;
  imagePath: string;
  currentClassification: {
    subjectId: string;
    categoryId: string | null;
    origin?: string;
  } | null;
}

export interface CodexClassificationTask {
  version: 1;
  format: typeof CODEX_CLASSIFICATION_TASK_FORMAT;
  taskId: string;
  generatedAt: string;
  taxonomy: {
    subjects: Array<{ id: string; name: string }>;
    categories: Array<{
      id: string;
      subjectId: string;
      parentId: string | null;
      categoryType: string;
      name: string;
    }>;
  };
  questions: CodexTaskQuestion[];
}

const resultItemSchema = z.object({
  questionCardId: z.string().min(1),
  subjectId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(2).max(1_000),
});

const resultSchema = z.object({
  version: z.literal(1),
  format: z.literal(CODEX_CLASSIFICATION_RESULT_FORMAT),
  taskId: z.string().min(1),
  generatedAt: z.string().min(1),
  classifications: z.array(resultItemSchema).min(1),
});

export type CodexClassificationResult = z.infer<typeof resultSchema>;
export type CodexClassificationResultItem = z.infer<typeof resultItemSchema>;

export interface CodexImportAssessment {
  item: CodexClassificationResultItem;
  status: "apply" | "protected" | "review" | "invalid";
  message: string;
  subjectName?: string;
  categoryName?: string;
}

function markdownCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function buildTaskMarkdown(task: CodexClassificationTask) {
  const subjects = new Map(task.taxonomy.subjects.map((subject) => [subject.id, subject.name]));
  const categories = new Map(task.taxonomy.categories.map((category) => [category.id, category]));
  const taxonomyRows = task.taxonomy.categories
    .filter((category) => category.categoryType === "middle")
    .map((category) => {
      const parent = category.parentId ? categories.get(category.parentId) : null;
      return `| ${markdownCell(subjects.get(category.subjectId) ?? category.subjectId)} | ${markdownCell(parent?.name ?? "")} | ${markdownCell(category.name)} | \`${category.id}\` |`;
    });
  const questionSections = task.questions.map((question, index) => [
    `## ${index + 1}. ${question.questionNumber ? `${question.questionNumber}번` : "번호 미상"} · ${question.sourceName}`,
    "",
    `- questionCardId: \`${question.questionCardId}\``,
    `- 원본 이미지: [${question.imagePath}](${question.imagePath})`,
    question.currentClassification?.categoryId
      ? `- 현재 자동 분류: \`${question.currentClassification.categoryId}\` (기존 판단을 그대로 따르지 말고 원문을 재검토)`
      : "- 현재 분류: 미지정 또는 확인 필요",
    "",
    `![문항 ${index + 1}](${question.imagePath})`,
    "",
    "### 추출 텍스트",
    "",
    question.questionText || "(추출된 문항 텍스트 없음 — 이미지를 판독하세요.)",
    question.answerText ? `\n정답 참고: ${question.answerText}` : "",
    question.explanationText ? `\n해설 참고: ${question.explanationText}` : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");

  return [
    "# 문항 카드 중단원 분류 작업",
    "",
    `- 작업 ID: \`${task.taskId}\``,
    `- 문항 수: ${task.questions.length}개`,
    "",
    "## 수행 규칙",
    "",
    "1. 각 문항의 원본 이미지와 추출 텍스트를 함께 확인합니다.",
    "2. 먼저 과목과 시대·대단원을 확정한 뒤, 아래 허용된 중단원에서만 하나를 선택합니다.",
    "3. 현재 자동 분류 표시는 참고하지 말고 문항의 구체적인 인물·사건·연도·정책을 근거로 재판정합니다.",
    "4. 판단 근거가 부족하면 categoryId를 null로 두고 confidence를 낮게 지정합니다.",
    "5. questionCardId는 절대 수정하지 않습니다.",
    "6. 작업이 끝나면 classification-result.template.json을 채운 classification-result.json 파일을 반환합니다. Markdown 설명만 반환하지 마세요.",
    "",
    "## 허용 중단원",
    "",
    "| 과목 | 대단원 | 중단원 | categoryId |",
    "|---|---|---|---|",
    ...taxonomyRows,
    "",
    "## 문항",
    "",
    questionSections,
  ].join("\n");
}

function resultTemplate(task: CodexClassificationTask) {
  return {
    version: 1,
    format: CODEX_CLASSIFICATION_RESULT_FORMAT,
    taskId: task.taskId,
    generatedAt: task.generatedAt,
    classifications: task.questions.map((question) => ({
      questionCardId: question.questionCardId,
      subjectId: question.currentClassification?.subjectId ?? "",
      categoryId: null,
      confidence: 0,
      reason: "문항의 구체적인 시대 근거를 작성",
    })),
  };
}

export function buildCodexClassificationTaskArchive(input: {
  taskId: string;
  generatedAt: string;
  classificationData: ClassificationData;
  questions: CodexTaskQuestion[];
  images: Record<string, Uint8Array>;
}) {
  const activeSubjectIds = new Set(input.classificationData.subjects
    .filter((subject) => subject.isActive)
    .map((subject) => subject.id));
  const task: CodexClassificationTask = {
    version: 1,
    format: CODEX_CLASSIFICATION_TASK_FORMAT,
    taskId: input.taskId,
    generatedAt: input.generatedAt,
    taxonomy: {
      subjects: input.classificationData.subjects
        .filter((subject) => subject.isActive)
        .map(({ id, name }) => ({ id, name })),
      categories: input.classificationData.categories
        .filter((category) => category.isActive && activeSubjectIds.has(category.subjectId))
        .map(({ id, subjectId, parentId, categoryType, name }) => ({
          id,
          subjectId,
          parentId,
          categoryType,
          name,
        })),
    },
    questions: input.questions,
  };
  const files: Zippable = {
    "classification-task.md": strToU8(buildTaskMarkdown(task)),
    "task.json": strToU8(JSON.stringify(task, null, 2)),
    "classification-result.template.json": strToU8(JSON.stringify(resultTemplate(task), null, 2)),
  };
  Object.entries(input.images).forEach(([path, bytes]) => {
    files[path] = bytes;
  });
  const date = input.generatedAt.slice(0, 10).replaceAll("-", "");
  return {
    task,
    fileName: `codex-classification-task-${date}-${input.questions.length}.zip`,
    bytes: zipSync(files, { level: 6 }),
  };
}

function extractJsonText(value: string) {
  const trimmed = value.replace(/^\uFEFF/u, "").trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
    if (fenced) return fenced;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    throw new Error("결과 파일에서 JSON을 찾지 못했습니다.");
  }
}

export function parseCodexClassificationResult(value: string): CodexClassificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(value));
  } catch (error) {
    throw new Error(error instanceof Error ? `결과 JSON을 읽지 못했습니다: ${error.message}` : "결과 JSON을 읽지 못했습니다.");
  }
  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`결과 형식이 올바르지 않습니다: ${result.error.issues[0]?.message ?? "스키마 오류"}`);
  }
  const seen = new Set<string>();
  for (const item of result.data.classifications) {
    if (seen.has(item.questionCardId)) throw new Error(`중복된 문항 ID가 있습니다: ${item.questionCardId}`);
    seen.add(item.questionCardId);
  }
  return result.data;
}

export function assessCodexClassificationResult(
  result: CodexClassificationResult,
  cards: LocalQuestionCardSummary[],
  classificationData: ClassificationData,
): CodexImportAssessment[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const subjectsById = new Map(classificationData.subjects.map((subject) => [subject.id, subject]));
  const categoriesById = new Map(classificationData.categories.map((category) => [category.id, category]));
  return result.classifications.map((item) => {
    const card = cardsById.get(item.questionCardId);
    if (!card) return { item, status: "invalid", message: "현재 DB에 없는 문항 ID입니다." };
    if (!item.categoryId) return { item, status: "review", message: "Codex가 중단원을 확정하지 못했습니다." };
    const subject = subjectsById.get(item.subjectId);
    const category = categoriesById.get(item.categoryId);
    if (!subject?.isActive) return { item, status: "invalid", message: "존재하지 않거나 비활성화된 과목입니다." };
    if (!category?.isActive || category.subjectId !== item.subjectId || category.categoryType !== "middle") {
      return { item, status: "invalid", message: "허용된 중단원 ID가 아니거나 과목이 일치하지 않습니다." };
    }
    const existing = card.classification;
    if (existing?.categoryId && (!existing.origin || existing.origin === "manual")) {
      return {
        item,
        status: "protected",
        message: "사용자가 직접 확정한 분류이므로 보호됩니다.",
        subjectName: subject.name,
        categoryName: category.name,
      };
    }
    return {
      item,
      status: "apply",
      message: "가져오기를 실행하면 적용됩니다.",
      subjectName: subject.name,
      categoryName: category.name,
    };
  });
}
