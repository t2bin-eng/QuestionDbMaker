import { describe, expect, it } from "vitest";
import type { EditableRegion } from "./question-detection";
import { buildReviewTrainingSample } from "./review-training";

function region(overrides: Partial<EditableRegion> = {}): EditableRegion {
  return {
    id: "auto-1",
    questionKey: "q-1",
    questionNumber: "1",
    pageNumber: 1,
    xRatio: 0.05,
    yRatio: 0.1,
    widthRatio: 0.4,
    heightRatio: 0.2,
    regionType: "question",
    sortOrder: 0,
    status: "auto_detected",
    ...overrides,
  };
}

describe("review training sample", () => {
  it("summarizes added, deleted, moved, and reviewed regions", () => {
    const sample = buildReviewTrainingSample({
      documentId: "doc-1",
      fileName: "시험지.pdf",
      pageCount: 2,
      automaticRegions: [region(), region({ id: "deleted", questionKey: "q-2" })],
      correctedRegions: [
        region({ xRatio: 0.08, status: "reviewed" }),
        region({ id: "manual", questionKey: "q-3", status: "reviewed" }),
      ],
      inspection: null,
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(sample.corrections).toEqual({ added: 1, deleted: 1, movedOrResized: 1, reviewed: 2 });
    expect(sample.usableForTraining).toBe(true);
    expect(sample.source.relativePdfPath).toBe("documents/doc-1/source.pdf");
  });
});
