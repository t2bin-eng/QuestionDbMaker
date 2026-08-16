import type {
  ConfirmedClassificationExample,
  MiddleUnitCandidate,
  QuestionTextRecord,
  RankedClassificationCandidate,
} from "./auto-classification";

export interface SemanticClassificationResult {
  questionKey: string;
  categoryId: string;
  confidence: number;
  isConfident: boolean;
  semanticSimilarity: number;
  semanticMargin: number;
  reason: string;
  candidates: RankedClassificationCandidate[];
}

export interface SemanticRuntimeProgress {
  phase: "loading" | "embedding" | "fallback";
  runtime: "webgpu" | "wasm";
  progress?: number;
  message: string;
}

export interface SemanticEmbeddingInput {
  records: QuestionTextRecord[];
  candidates: MiddleUnitCandidate[];
  localCandidatesByQuestion: Record<string, RankedClassificationCandidate[]>;
  confirmedExamples?: ConfirmedClassificationExample[];
}

export interface SemanticEmbeddingOutput {
  runtime: "webgpu" | "wasm";
  questionEmbeddings: number[][];
  candidateEmbeddings: number[][][];
  majorEmbeddings?: Record<string, number[][]>;
}

export function buildSemanticQuestionText(record: QuestionTextRecord) {
  const sections = [
    record.explanationText && `해설: ${record.explanationText}`,
    record.answerText && `정답: ${record.answerText}`,
    record.questionText && `문항: ${record.questionText}`,
  ].filter(Boolean);
  return sections.join("\n").slice(0, 4_000);
}

export function buildSemanticCandidateDocuments(
  candidate: MiddleUnitCandidate,
  examples: ConfirmedClassificationExample[] = [],
) {
  const profile = [
    `역사 과목 중단원 분류`,
    `대단원: ${candidate.majorName}`,
    `중단원: ${candidate.name}`,
    `이 단원에서 다루는 핵심 개념: ${candidate.profile}`,
  ].join("\n");
  const concepts = candidate.profile.split(" · ").slice(2).filter(Boolean);
  const conceptDocuments: string[] = [];
  for (let start = 0; start < concepts.length; start += 3) {
    conceptDocuments.push([
      `대단원: ${candidate.majorName}`,
      `중단원: ${candidate.name}`,
      `대표 핵심 개념: ${concepts.slice(start, start + 3).join(", ")}`,
    ].join("\n"));
  }
  const confirmed = examples
    .filter((example) => example.categoryId === candidate.id)
    .slice(0, 3)
    .map((example) => buildSemanticQuestionText(example).slice(0, 800));
  return [profile, ...conceptDocuments, ...confirmed];
}

export function buildSemanticMajorDocuments(
  majorName: string,
  candidates: MiddleUnitCandidate[],
) {
  const children = candidates.filter((candidate) => candidate.majorName === majorName);
  return [
    [
      `역사 과목 대단원 분류`,
      `대단원: ${majorName}`,
      `하위 중단원: ${children.map((candidate) => candidate.name).join(", ")}`,
    ].join("\n"),
    ...children.map((candidate) => [
      `대단원: ${majorName}`,
      `이 대단원에서 다루는 내용: ${candidate.name}`,
      `대표 개념: ${candidate.profile.split(" · ").slice(2).join(", ")}`,
    ].join("\n")),
  ];
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function documentGroupSimilarity(questionEmbedding: number[], embeddings: number[][]) {
  const similarities = embeddings.map((embedding) => cosineSimilarity(questionEmbedding, embedding));
  const profileSimilarity = similarities[0] ?? 0;
  const focusedSimilarity = Math.max(profileSimilarity, ...similarities.slice(1));
  return profileSimilarity * 0.58 + focusedSimilarity * 0.42;
}

export function rankSemanticCandidates(
  questionKey: string,
  questionEmbedding: number[],
  candidates: MiddleUnitCandidate[],
  candidateEmbeddings: number[][][],
  localCandidates: RankedClassificationCandidate[] = [],
  majorEmbeddings: Record<string, number[][]> = {},
): SemanticClassificationResult | null {
  if (!questionEmbedding.length || candidates.length !== candidateEmbeddings.length) return null;
  const bestLocalScore = Math.max(0, ...localCandidates.map((candidate) => candidate.score));
  const localScores = new Map(localCandidates.map((candidate) => [
    candidate.categoryId,
    bestLocalScore > 0 ? candidate.score / bestLocalScore : 0,
  ]));

  const ranked = candidates
    .map((candidate, index) => {
      const middleSimilarity = documentGroupSimilarity(
        questionEmbedding,
        candidateEmbeddings[index] ?? [],
      );
      const majorDocuments = majorEmbeddings[candidate.majorName] ?? [];
      const majorSimilarity = majorDocuments.length
        ? documentGroupSimilarity(questionEmbedding, majorDocuments)
        : middleSimilarity;
      const similarity = middleSimilarity * 0.62 + majorSimilarity * 0.38;
      const localSignal = localScores.get(candidate.id) ?? 0;
      // The semantic model is authoritative. Rules normally only break a near tie.
      const combinedScore = similarity + localSignal * 0.004;
      return {
        categoryId: candidate.id,
        categoryName: candidate.name,
        majorName: candidate.majorName,
        score: Number(combinedScore.toFixed(4)),
        similarity,
        localSignal,
        matchedTerms: localCandidates.find((item) => item.categoryId === candidate.id)?.matchedTerms ?? [],
        decisiveMatchedTerms: localCandidates.find((item) => item.categoryId === candidate.id)?.decisiveMatchedTerms ?? [],
      };
    })
    .sort((left, right) => right.score - left.score);
  const semanticFirst = ranked[0];
  if (!semanticFirst) return null;
  const anchoredLocalCandidates = localCandidates.filter((candidate) =>
    (candidate.decisiveMatchedTerms?.length ?? 0) > 0);
  const anchoredCategoryIds = new Set(anchoredLocalCandidates.map((candidate) => candidate.categoryId));
  const anchoredLocalCandidate = anchoredCategoryIds.size === 1
    ? anchoredLocalCandidates[0]
    : undefined;
  const hasDistinctiveLocalAnchor = Boolean(anchoredLocalCandidate);
  const anchoredCandidate = hasDistinctiveLocalAnchor
    ? ranked.find((candidate) => candidate.categoryId === anchoredLocalCandidate?.categoryId)
    : undefined;
  const first = anchoredCandidate ?? semanticFirst;
  const ordered = anchoredCandidate
    ? [anchoredCandidate, ...ranked.filter((candidate) => candidate.categoryId !== anchoredCandidate.categoryId)]
    : ranked;
  const second = ordered[1];

  const semanticMargin = first.similarity - (second?.similarity ?? 0);
  const semanticEvidence = clamp((first.similarity - 0.22) / 0.48);
  const separation = clamp((semanticMargin - 0.004) / 0.1);
  const confidence = Number((anchoredCandidate
    ? clamp(0.72 + Math.min(0.18, (anchoredLocalCandidate?.score ?? 0) / 100), 0.72, 0.9)
    : clamp(0.35 + semanticEvidence * 0.4 + separation * 0.25, 0.35, 0.96)).toFixed(3));
  const localAgrees = localCandidates[0]?.categoryId === first.categoryId &&
    (localCandidates[0]?.score ?? 0) >= 3;
  const usedLocalTieBreaker = !anchoredCandidate && localAgrees && semanticMargin < 0.0041;
  const isConfident = Boolean(anchoredCandidate) || (first.similarity >= 0.3 && (
    semanticMargin >= 0.012 ||
    (localAgrees && semanticMargin >= 0.006)
  ));
  const alternatives = ordered.slice(0, 3).map<RankedClassificationCandidate>((candidate) => ({
    categoryId: candidate.categoryId,
    categoryName: candidate.categoryName,
    majorName: candidate.majorName,
    score: candidate.score,
    matchedTerms: candidate.matchedTerms,
    decisiveMatchedTerms: candidate.decisiveMatchedTerms,
  }));

  return {
    questionKey,
    categoryId: first.categoryId,
    confidence,
    isConfident,
    semanticSimilarity: Number(first.similarity.toFixed(4)),
    semanticMargin: Number((anchoredCandidate ? 0 : semanticMargin).toFixed(4)),
    reason: anchoredCandidate
      ? `시대·중단원 고유 핵심어 ${(anchoredLocalCandidate?.decisiveMatchedTerms ?? []).slice(0, 3).join(", ")}로 후보를 제한한 뒤 WebGPU 의미 분석`
      : `대단원→중단원 계층형 의미 유사도 ${Math.round(first.similarity * 100)}% · 2순위와 차이 ${(semanticMargin * 100).toFixed(1)}%p${usedLocalTieBreaker ? " · 규칙 동점 보정 적용" : ""}`,
    candidates: alternatives,
  };
}

export function buildSemanticClassificationResults(
  input: SemanticEmbeddingInput,
  output: SemanticEmbeddingOutput,
) {
  return input.records.flatMap((record, index) => {
    const result = rankSemanticCandidates(
      record.questionKey,
      output.questionEmbeddings[index] ?? [],
      input.candidates,
      output.candidateEmbeddings,
      input.localCandidatesByQuestion[record.questionKey] ?? [],
      output.majorEmbeddings,
    );
    return result ? [result] : [];
  });
}
