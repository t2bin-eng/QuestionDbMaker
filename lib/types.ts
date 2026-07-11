export type Difficulty = "하" | "중" | "고";
export type ReviewStatus = "정상" | "검토 필요" | "오류";

export interface QuizQuestion {
  id: string;
  sourceQuestionNumber: string;
  pageNumbers: number[];
  category: string;
  difficulty: Difficulty;
  prompt: string;
  passages: string[];
  choices: string[];
  answerNumber: number | null;
  explanation?: string;
  timeLimitSeconds?: number | null;
  reviewStatus: ReviewStatus;
  confidence: number;
  warnings: string[];
  originalText: string;
  rawBlocks?: Array<{ page: number; text: string; x?: number; y?: number; width?: number; height?: number }>;
}
