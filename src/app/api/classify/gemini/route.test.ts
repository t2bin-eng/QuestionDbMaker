import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const validBody = {
  subjectName: "한국사2",
  candidates: [
    {
      id: "middle-industrialization",
      subjectId: "history-2",
      name: "산업화의 성과와 사회·환경 문제",
      majorName: "대한민국의 발전",
      profile: "산업화 경제 성장 노동 도시 환경",
    },
    {
      id: "middle-democratization",
      subjectId: "history-2",
      name: "6월 민주 항쟁 이후 민주주의 과정",
      majorName: "대한민국의 발전",
      profile: "민주화 6월 항쟁 대통령 직선제",
    },
  ],
  questions: [{
    questionKey: "doc-1:q-1",
    questionNumber: "1",
    questionText: "경제 개발 계획 이후 산업화의 모습을 고르시오.",
    answerText: "수출 증가",
    explanationText: "정부 주도의 경제 개발 계획과 산업화에 대한 문항이다.",
    localCandidates: [{
      categoryId: "middle-industrialization",
      categoryName: "산업화의 성과와 사회·환경 문제",
      majorName: "대한민국의 발전",
      score: 4,
      matchedTerms: ["산업화"],
    }],
  }],
};

function request(ip: string) {
  return new Request("http://localhost/api/classify/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(validBody),
  });
}

describe("Gemini 무료 전용 분류 API", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_FREE_TIER_ONLY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_FREE_TIER_ONLY;
  });

  it("무료 등급 확인 설정 없이는 외부 호출을 차단한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request("test-disabled"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "FREE_TIER_NOT_CONFIRMED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("고정된 무료 모델만 호출하고 구조화 결과를 검증한다", async () => {
    process.env.GEMINI_API_KEY = "free-project-test-key";
    process.env.GEMINI_FREE_TIER_ONLY = "true";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({
            results: [{
              questionKey: "doc-1:q-1",
              categoryId: "middle-industrialization",
              confidence: 0.91,
              reason: "경제 개발 계획과 산업화가 핵심이다.",
            }],
          }) }],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request("test-success"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      model: "gemini-3.5-flash-lite",
      tier: "free-only",
      results: [{ categoryId: "middle-industrialization" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-3.5-flash-lite:generateContent");
  });

  it("무료 쿼터 소진 시 다른 모델로 재시도하지 않는다", async () => {
    process.env.GEMINI_API_KEY = "free-project-test-key";
    process.env.GEMINI_FREE_TIER_ONLY = "true";
    const fetchMock = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request("test-quota"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "FREE_TIER_QUOTA_EXHAUSTED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
