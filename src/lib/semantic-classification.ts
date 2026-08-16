import type {
  MiddleUnitCandidate,
  QuestionTextRecord,
  RankedClassificationCandidate,
} from "./auto-classification";

export interface SemanticClassificationResult {
  questionKey: string;
  categoryId: string;
  confidence: number;
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
}

export interface SemanticEmbeddingOutput {
  runtime: "webgpu" | "wasm";
  questionEmbeddings: number[][];
  candidateEmbeddings: number[][];
}

export function buildSemanticQuestionText(record: QuestionTextRecord) {
  const sections = [
    record.explanationText && `해설: ${record.explanationText}`,
    record.answerText && `정답: ${record.answerText}`,
    record.questionText && `문항: ${record.questionText}`,
  ].filter(Boolean);
  return sections.join("\n").slice(0, 4_000);
}

export function buildSemanticCandidateText(candidate: MiddleUnitCandidate) {
  return [
    `역사 과목 중단원 분류`,
    `대단원: ${candidate.majorName}`,
    `중단원: ${candidate.name}`,
    `핵심 개념: ${candidate.profile}`,
  ].join("\n");
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

export function rankSemanticCandidates(
  questionKey: string,
  questionEmbedding: number[],
  candidates: MiddleUnitCandidate[],
  candidateEmbeddings: number[][],
  localCandidates: RankedClassificationCandidate[] = [],
): SemanticClassificationResult | null {
  if (!questionEmbedding.length || candidates.length !== candidateEmbeddings.length) return null;
  const bestLocalScore = Math.max(0, ...localCandidates.map((candidate) => candidate.score));
  const localScores = new Map(localCandidates.map((candidate) => [
    candidate.categoryId,
    bestLocalScore > 0 ? candidate.score / bestLocalScore : 0,
  ]));

  const ranked = candidates
    .map((candidate, index) => {
      const similarity = cosineSimilarity(questionEmbedding, candidateEmbeddings[index]);
      const localSignal = localScores.get(candidate.id) ?? 0;
      const combinedScore = similarity * 0.86 + localSignal * 0.14;
      return {
        categoryId: candidate.id,
        categoryName: candidate.name,
        majorName: candidate.majorName,
        score: Number(combinedScore.toFixed(4)),
        similarity,
        localSignal,
        matchedTerms: localCandidates.find((item) => item.categoryId === candidate.id)?.matchedTerms ?? [],
      };
    })
    .sort((left, right) => right.score - left.score);
  const first = ranked[0];
  const second = ranked[1];
  if (!first) return null;

  const margin = Math.max(0, first.score - (second?.score ?? 0));
  const semanticEvidence = clamp((first.similarity - 0.12) / 0.58);
  const separation = clamp(margin / 0.14);
  const confidence = Number(clamp(0.42 + semanticEvidence * 0.38 + separation * 0.2, 0.42, 0.96).toFixed(3));
  const alternatives = ranked.slice(0, 3).map<RankedClassificationCandidate>((candidate) => ({
    categoryId: candidate.categoryId,
    categoryName: candidate.categoryName,
    majorName: candidate.majorName,
    score: candidate.score,
    matchedTerms: candidate.matchedTerms,
  }));

  return {
    questionKey,
    categoryId: first.categoryId,
    confidence,
    reason: `브라우저 의미 유사도 ${Math.round(first.similarity * 100)}% · 1단계 규칙 신호 ${Math.round(first.localSignal * 100)}%`,
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
    );
    return result ? [result] : [];
  });
}
