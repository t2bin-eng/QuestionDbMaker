export type WorkspaceRole = "owner" | "editor" | "viewer";
export type AnalysisStatus =
  | "uploaded"
  | "analyzing"
  | "review"
  | "completed"
  | "failed"
  | "ocr_required";
export type ReviewStatus = "auto_detected" | "needs_review" | "reviewed" | "saved" | "error";
export type RegionType = "question" | "answer" | "explanation";

export interface QuestionRegion {
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  regionType: RegionType;
  sortOrder: number;
}

export interface QuestionCard {
  id: string;
  sourceQuestionNumber: string | null;
  title: string;
  searchText: string;
  difficulty: number | null;
  score: number | null;
  tagNames: string[];
  reviewStatus: ReviewStatus;
  isFavorite: boolean;
}
