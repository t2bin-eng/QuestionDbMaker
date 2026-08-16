"use client";

import type {
  MiddleUnitCandidate,
  QuestionTextRecord,
  RankedClassificationCandidate,
} from "./auto-classification";
import {
  listLocalModelIds,
  localModelHeaders,
  normalizeLocalModelBaseUrl,
  type LocalModelSettings,
} from "./local-model-settings";

export interface BionicClassificationResult {
  questionKey: string;
  categoryId: string;
  confidence: number;
  isConfident: boolean;
  reason: string;
  candidates: RankedClassificationCandidate[];
}

export interface BionicClassificationOutput {
  results: BionicClassificationResult[];
  failedQuestionKeys: string[];
}

interface BionicResponseValue {
  majorName?: unknown;
  categoryId?: unknown;
  category?: unknown;
  evidence?: unknown;
  confidence?: unknown;
  needsReview?: unknown;
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[^0-9A-Za-z가-힣]/g, "").toLocaleLowerCase("ko-KR");
}

export function parseBionicJson(value: string): BionicResponseValue {
  const unfenced = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Bionic이 JSON 분류 결과를 반환하지 않았습니다.");
  return JSON.parse(unfenced.slice(start, end + 1)) as BionicResponseValue;
}

function candidatePrompt(candidates: MiddleUnitCandidate[]) {
  return candidates.map((candidate) => {
    const concepts = candidate.profile.split(" · ").slice(2).join(", ");
    return `- categoryId=${candidate.id} | 대단원=${candidate.majorName} | 중단원=${candidate.name} | 대표 개념=${concepts}`;
  }).join("\n");
}

function buildPrompt(record: QuestionTextRecord, candidates: MiddleUnitCandidate[]) {
  return [
    "원본 문항 이미지를 직접 판독해 한국사 교육과정 중단원을 분류하세요.",
    "반드시 먼저 시대·대단원을 확정하고, 그 대단원에 속한 중단원 안에서만 선택하세요.",
    "일제강점기 사회 문화와 대중 운동은 물산 장려·민립 대학·브나로드·형평 운동 등 1910~1945년의 운동입니다.",
    "박정희 정부의 장발·미니스커트 단속, 유신과 권위주의적 사회 통제는 대한민국의 발전 > 민주화를 위한 노력입니다.",
    "경부고속국도·새마을 운동·경제 개발 계획은 대한민국의 발전 > 산업화의 성과와 사회·환경 문제입니다.",
    "앱의 분류 태그나 UI는 이미지에 포함되지 않았으며, 추출 텍스트보다 원본 이미지를 우선하세요.",
    "허용 후보:",
    candidatePrompt(candidates),
    "참고용 추출 텍스트:",
    `문항: ${record.questionText.slice(0, 2_000)}`,
    `정답: ${record.answerText.slice(0, 800)}`,
    `해설: ${record.explanationText.slice(0, 1_500)}`,
    "아래 JSON 한 줄만 출력하세요. categoryId와 majorName은 위 후보의 값을 완전히 똑같이 사용하세요.",
    '{"majorName":"대단원명","categoryId":"후보 ID","evidence":"원본 문항에서 직접 확인한 구체적 시대 근거","confidence":0.0,"needsReview":false}',
  ].join("\n");
}

function messageContent(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("output" in payload) || !Array.isArray(payload.output)) return "";
  return payload.output
    .filter((item): item is { type: string; content: string } => Boolean(
      item && typeof item === "object" &&
      "type" in item && item.type === "message" &&
      "content" in item && typeof item.content === "string"))
    .map((item) => item.content)
    .join("\n");
}

function validateResult(
  questionKey: string,
  raw: BionicResponseValue,
  candidates: MiddleUnitCandidate[],
  localCandidates: RankedClassificationCandidate[],
) {
  const requestedCategory = String(raw.categoryId ?? raw.category ?? "").trim();
  const selected = candidates.find((candidate) =>
    candidate.id === requestedCategory || normalize(candidate.name) === normalize(requestedCategory));
  if (!selected) throw new Error("Bionic이 허용되지 않은 중단원을 반환했습니다.");
  const requestedMajor = String(raw.majorName ?? "").trim();
  const majorMatches = !requestedMajor || (
    normalize(requestedMajor).includes(normalize(selected.majorName)) ||
    normalize(selected.majorName).includes(normalize(requestedMajor))
  );
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(String).join(", ")
    : String(raw.evidence ?? "").trim();
  const confidenceValue = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : 0;
  const genericEvidence = !evidence || evidence.length < 6 || /^(?:사진|자료|문항|현대사|사진으로보는현대사)$/u.test(normalize(evidence));
  const anchored = localCandidates.filter((candidate) => (candidate.decisiveMatchedTerms?.length ?? 0) > 0);
  const anchoredCategoryIds = new Set(anchored.map((candidate) => candidate.categoryId));
  const anchorConflict = anchoredCategoryIds.size === 1 && !anchoredCategoryIds.has(selected.id);
  const needsReview = raw.needsReview === true || confidence < 0.78 || genericEvidence || !majorMatches || anchorConflict;
  const selectedAlternative: RankedClassificationCandidate = {
    categoryId: selected.id,
    categoryName: selected.name,
    majorName: selected.majorName,
    score: confidence,
    matchedTerms: evidence ? [evidence.slice(0, 160)] : [],
  };
  return {
    questionKey,
    categoryId: selected.id,
    confidence,
    isConfident: !needsReview,
    reason: anchorConflict
      ? `Bionic 판정과 고유 핵심어가 충돌하여 확인 필요 · Bionic 근거: ${evidence}`
      : `Bionic 원본 이미지 시대 판정 · ${selected.majorName} > ${selected.name} · 근거: ${evidence}`,
    candidates: [
      selectedAlternative,
      ...localCandidates.filter((candidate) => candidate.categoryId !== selected.id).slice(0, 2),
    ],
  } satisfies BionicClassificationResult;
}

async function classifyOne(
  settings: LocalModelSettings,
  record: QuestionTextRecord,
  images: string[],
  candidates: MiddleUnitCandidate[],
  localCandidates: RankedClassificationCandidate[],
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const input = [
      { type: "text", content: buildPrompt(record, candidates) },
      ...images.map((dataUrl) => ({ type: "image", data_url: dataUrl })),
    ];
    const request = new Request(`${normalizeLocalModelBaseUrl(settings.baseUrl)}/api/v1/chat`, {
      method: "POST",
      mode: "cors",
      headers: localModelHeaders(settings),
      body: JSON.stringify({
        model: settings.model,
        input,
        system_prompt: "당신은 한국사 2022 개정 교육과정 분류기입니다. 시대를 먼저 확정하고 허용 후보 안에서만 고르며, 설명 없이 JSON만 출력합니다.",
        reasoning: "off",
        temperature: 0,
        max_output_tokens: 350,
        store: false,
        stream: false,
      }),
      signal: controller.signal,
      targetAddressSpace: "loopback",
    } as RequestInit & { targetAddressSpace: "loopback" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Bionic 분류 요청 실패 (${response.status})`);
    const payload = await response.json() as unknown;
    return validateResult(
      record.questionKey,
      parseBionicJson(messageContent(payload)),
      candidates,
      localCandidates,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function classifyWithBionicVision(input: {
  settings: LocalModelSettings;
  records: QuestionTextRecord[];
  imagesByQuestion: Record<string, string[]>;
  candidates: MiddleUnitCandidate[];
  localCandidatesByQuestion: Record<string, RankedClassificationCandidate[]>;
  onProgress?: (message: string) => void;
}): Promise<BionicClassificationOutput> {
  const modelIds = await listLocalModelIds(input.settings);
  if (!modelIds.includes(input.settings.model)) {
    throw new Error(`Bionic에서 ${input.settings.model} 모델을 찾지 못했습니다.`);
  }
  const results: BionicClassificationResult[] = [];
  const failedQuestionKeys: string[] = [];
  for (let index = 0; index < input.records.length; index += 1) {
    const record = input.records[index];
    const images = input.imagesByQuestion[record.questionKey] ?? [];
    if (!images.length) {
      failedQuestionKeys.push(record.questionKey);
      continue;
    }
    input.onProgress?.(`Bionic 원본 이미지 분류 ${index + 1}/${input.records.length}`);
    try {
      results.push(await classifyOne(
        input.settings,
        record,
        images,
        input.candidates,
        input.localCandidatesByQuestion[record.questionKey] ?? [],
      ));
    } catch {
      failedQuestionKeys.push(record.questionKey);
    }
  }
  return { results, failedQuestionKeys };
}
