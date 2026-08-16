import { describe, expect, it } from "vitest";
import type { MiddleUnitCandidate } from "./auto-classification";
import { cosineSimilarity, rankSemanticCandidates } from "./semantic-classification";

const candidates: MiddleUnitCandidate[] = [
  { id: "industry", subjectId: "history", name: "산업화", majorName: "대한민국", profile: "경제 개발 수출" },
  { id: "democracy", subjectId: "history", name: "민주화", majorName: "대한민국", profile: "민주 항쟁 직선제" },
];

describe("browser semantic classification ranking", () => {
  it("calculates cosine similarity without assuming normalized vectors", () => {
    expect(cosineSimilarity([2, 0], [4, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("selects the closest middle-unit embedding", () => {
    const result = rankSemanticCandidates(
      "q1",
      [0.95, 0.05],
      candidates,
      [[1, 0], [0, 1]],
    );
    expect(result?.categoryId).toBe("industry");
    expect(result?.candidates).toHaveLength(2);
    expect(result?.confidence).toBeGreaterThan(0.7);
  });

  it("uses first-stage local evidence as a controlled tie breaker", () => {
    const result = rankSemanticCandidates(
      "q2",
      [1, 1],
      candidates,
      [[1, 0], [0, 1]],
      [{ categoryId: "democracy", categoryName: "민주화", majorName: "대한민국", score: 4, matchedTerms: ["직선제"] }],
    );
    expect(result?.categoryId).toBe("democracy");
    expect(result?.reason).toContain("1단계 규칙 신호");
  });
});
