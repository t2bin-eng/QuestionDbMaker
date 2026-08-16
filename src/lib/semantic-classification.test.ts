import { describe, expect, it } from "vitest";
import type { MiddleUnitCandidate } from "./auto-classification";
import { buildSemanticCandidateDocuments, cosineSimilarity, rankSemanticCandidates } from "./semantic-classification";

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
      [[[1, 0]], [[0, 1]]],
    );
    expect(result?.categoryId).toBe("industry");
    expect(result?.candidates).toHaveLength(2);
    expect(result?.confidence).toBeGreaterThan(0.7);
    expect(result?.isConfident).toBe(true);
  });

  it("uses first-stage local evidence as a controlled tie breaker", () => {
    const result = rankSemanticCandidates(
      "q2",
      [1, 1],
      candidates,
      [[[1, 0]], [[0, 1]]],
      [{ categoryId: "democracy", categoryName: "민주화", majorName: "대한민국", score: 4, matchedTerms: ["직선제"] }],
    );
    expect(result?.categoryId).toBe("democracy");
    expect(result?.isConfident).toBe(false);
    expect(result?.reason).toContain("동점 보정");
  });

  it("does not let a strong but wrong keyword score override clear semantics", () => {
    const result = rankSemanticCandidates(
      "q3",
      [0.95, 0.05],
      candidates,
      [[[1, 0]], [[0, 1]]],
      [{ categoryId: "democracy", categoryName: "민주화", majorName: "대한민국", score: 100, matchedTerms: ["직선제"] }],
    );
    expect(result?.categoryId).toBe("industry");
    expect(result?.isConfident).toBe(true);
  });

  it("corrects a model miss when multiple distinctive curriculum concepts agree", () => {
    const result = rankSemanticCandidates(
      "q-anchor",
      [0.05, 0.95],
      candidates,
      [[[1, 0]], [[0, 1]]],
      [{
        categoryId: "industry",
        categoryName: "산업화",
        majorName: "대한민국",
        score: 3.8,
        matchedTerms: ["새마을 운동", "산업화"],
        decisiveMatchedTerms: ["새마을 운동"],
      }],
    );
    expect(result?.categoryId).toBe("industry");
    expect(result?.isConfident).toBe(true);
    expect(result?.reason).toContain("고유 핵심어");
  });

  it("lets one unambiguous curriculum anchor correct a confident semantic miss", () => {
    const result = rankSemanticCandidates(
      "q-gyeongbu",
      [0.05, 0.95],
      candidates,
      [[[1, 0]], [[0, 1]]],
      [{
        categoryId: "industry",
        categoryName: "산업화",
        majorName: "대한민국",
        score: 1.9,
        matchedTerms: ["경부 고속 국도"],
        decisiveMatchedTerms: ["경부 고속 국도"],
      }],
    );
    expect(result?.categoryId).toBe("industry");
    expect(result?.isConfident).toBe(true);
  });

  it("keeps a semantically tied result for manual review", () => {
    const result = rankSemanticCandidates(
      "q4",
      [1, 1],
      candidates,
      [[[1, 0]], [[0, 1]]],
    );
    expect(result?.isConfident).toBe(false);
    expect(result?.semanticMargin).toBe(0);
  });

  it("creates compact concept documents so a distinctive term is not diluted", () => {
    const documents = buildSemanticCandidateDocuments({
      id: "industry",
      subjectId: "history",
      name: "산업화",
      majorName: "대한민국",
      profile: "대한민국 · 산업화 · 경제 개발 · 새마을 운동 · 중화학 공업 · 수출 주도",
    });
    expect(documents.length).toBeGreaterThan(1);
    expect(documents.some((document) => document.includes("새마을 운동"))).toBe(true);
  });
});
