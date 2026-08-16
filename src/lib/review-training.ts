import type { EditableRegion } from "./question-detection";
import type { PdfInspectionSummary } from "./pdf-inspector-client";

export const QUESTION_DETECTION_ALGORITHM_VERSION = "2026-08-layout-v4-answer-explanation";

export interface TrainingRegion {
  id: string;
  questionKey: string;
  questionNumber: string | null;
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  regionType: EditableRegion["regionType"];
  sortOrder: number;
  status: EditableRegion["status"];
  detectionConfidence?: number;
}

export interface ReviewTrainingSample {
  version: 1;
  documentId: string;
  source: {
    fileName: string;
    relativePdfPath: string;
    pageCount: number;
  };
  algorithmVersion: string;
  inspection: PdfInspectionSummary | null;
  automaticRegions: TrainingRegion[];
  correctedRegions: TrainingRegion[];
  corrections: {
    added: number;
    deleted: number;
    movedOrResized: number;
    reviewed: number;
  };
  usableForTraining: boolean;
  updatedAt: string;
}

function toTrainingRegion(region: EditableRegion): TrainingRegion {
  return {
    id: region.id,
    questionKey: region.questionKey,
    questionNumber: region.questionNumber,
    pageNumber: region.pageNumber,
    xRatio: region.xRatio,
    yRatio: region.yRatio,
    widthRatio: region.widthRatio,
    heightRatio: region.heightRatio,
    regionType: region.regionType,
    sortOrder: region.sortOrder,
    status: region.status,
    detectionConfidence: region.detectionConfidence,
  };
}

function geometryChanged(left: EditableRegion, right: EditableRegion) {
  const keys = ["pageNumber", "xRatio", "yRatio", "widthRatio", "heightRatio"] as const;
  return keys.some((key) => Math.abs(left[key] - right[key]) > 0.0005);
}

export function buildReviewTrainingSample({
  documentId,
  fileName,
  pageCount,
  automaticRegions,
  correctedRegions,
  inspection,
  updatedAt = new Date().toISOString(),
}: {
  documentId: string;
  fileName: string;
  pageCount: number;
  automaticRegions: EditableRegion[];
  correctedRegions: EditableRegion[];
  inspection: PdfInspectionSummary | null;
  updatedAt?: string;
}): ReviewTrainingSample {
  const automaticById = new Map(automaticRegions.map((region) => [region.id, region]));
  const correctedById = new Map(correctedRegions.map((region) => [region.id, region]));
  const added = correctedRegions.filter((region) => !automaticById.has(region.id)).length;
  const deleted = automaticRegions.filter((region) => !correctedById.has(region.id)).length;
  const movedOrResized = correctedRegions.filter((region) => {
    const automatic = automaticById.get(region.id);
    return automatic ? geometryChanged(automatic, region) : false;
  }).length;
  const reviewed = correctedRegions.filter((region) => region.status === "reviewed").length;

  return {
    version: 1,
    documentId,
    source: {
      fileName,
      relativePdfPath: `documents/${documentId}/source.pdf`,
      pageCount,
    },
    algorithmVersion: QUESTION_DETECTION_ALGORITHM_VERSION,
    inspection,
    automaticRegions: automaticRegions.map(toTrainingRegion),
    correctedRegions: correctedRegions.map(toTrainingRegion),
    corrections: { added, deleted, movedOrResized, reviewed },
    usableForTraining: correctedRegions.length > 0 && reviewed === correctedRegions.length,
    updatedAt,
  };
}
