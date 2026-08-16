import type {
  MiddleUnitCandidate,
  QuestionTextRecord,
  RankedClassificationCandidate,
} from "./auto-classification";

export interface GeminiClassificationQuestion extends QuestionTextRecord {
  localCandidates: RankedClassificationCandidate[];
}

export interface GeminiClassificationRequest {
  subjectName: string;
  candidates: MiddleUnitCandidate[];
  questions: GeminiClassificationQuestion[];
}

export interface GeminiClassificationAnswer {
  questionKey: string;
  categoryId: string;
  confidence: number;
  reason: string;
}

export interface GeminiClassificationResponse {
  results: GeminiClassificationAnswer[];
  model: string;
  tier: "free-only";
}
