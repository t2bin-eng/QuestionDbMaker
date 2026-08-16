import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_TIER_MODEL = "gemini-3.5-flash-lite";
const MAX_QUESTIONS_PER_REQUEST = 24;
const MAX_REQUESTS_PER_HOUR = 12;
const requestLog = new Map<string, number[]>();

const rankedCandidateSchema = z.object({
  categoryId: z.string().min(1).max(160),
  categoryName: z.string().min(1).max(160),
  majorName: z.string().max(160),
  score: z.number().finite(),
  matchedTerms: z.array(z.string().max(80)).max(6),
});

const requestSchema = z.object({
  subjectName: z.string().min(1).max(80),
  candidates: z.array(z.object({
    id: z.string().min(1).max(160),
    subjectId: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    majorName: z.string().max(160),
    profile: z.string().min(1).max(4000),
  })).min(2).max(40),
  questions: z.array(z.object({
    questionKey: z.string().min(1).max(180),
    questionNumber: z.string().max(30).nullable(),
    questionText: z.string().max(8000),
    answerText: z.string().max(4000),
    explanationText: z.string().max(8000),
    localCandidates: z.array(rankedCandidateSchema).max(3),
  })).min(1).max(MAX_QUESTIONS_PER_REQUEST),
});

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(key: string) {
  const now = Date.now();
  const active = (requestLog.get(key) ?? []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (active.length >= MAX_REQUESTS_PER_HOUR) return true;
  requestLog.set(key, [...active, now]);
  return false;
}

function errorResponse(error: string, status: number, code: string) {
  return Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (process.env.GEMINI_FREE_TIER_ONLY !== "true") {
    return errorResponse(
      "제미나이 무료 전용 확인 설정이 없어 외부 AI 호출을 중단했습니다.",
      503,
      "FREE_TIER_NOT_CONFIRMED",
    );
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(
      "제미나이 무료 등급 API 키가 설정되지 않았습니다.",
      503,
      "GEMINI_NOT_CONFIGURED",
    );
  }
  if (rateLimited(clientKey(request))) {
    return errorResponse(
      "무료 등급 보호를 위한 시간당 호출 한도를 초과했습니다.",
      429,
      "LOCAL_FREE_TIER_LIMIT",
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("자동 분류 요청 형식이 올바르지 않습니다.", 400, "INVALID_REQUEST");
  }
  const input = parsed.data;
  const candidateIds = input.candidates.map((candidate) => candidate.id);
  const questionKeys = input.questions.map((question) => question.questionKey);
  const prompt = [
    `과목: ${input.subjectName}`,
    "아래 문항을 반드시 제공된 중단원 ID 중 하나로 분류하세요.",
    "해설과 정답은 실제 출제 의도를 판단하는 가장 중요한 근거입니다.",
    "객관식 오답 선지는 다른 시대의 사건일 수 있으므로 단순 키워드로 선택하지 마세요.",
    "localCandidates는 로컬 분류기의 참고 결과일 뿐이며, 근거가 다르면 수정하세요.",
    "검색 도구를 사용하지 말고 제공된 내용만 판단하세요.",
    JSON.stringify(input),
  ].join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${FREE_TIER_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  minItems: input.questions.length,
                  maxItems: input.questions.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      questionKey: { type: "string", enum: questionKeys },
                      categoryId: { type: "string", enum: candidateIds },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                      reason: { type: "string", maxLength: 240 },
                    },
                    required: ["questionKey", "categoryId", "confidence", "reason"],
                  },
                },
              },
              required: ["results"],
            },
          },
        }),
      },
    );
    if (!response.ok) {
      if (response.status === 429) {
        return errorResponse(
          "제미나이 무료 쿼터가 소진되어 분류를 중단했습니다. 유료 모델로 전환하지 않았습니다.",
          503,
          "FREE_TIER_QUOTA_EXHAUSTED",
        );
      }
      return errorResponse(
        "제미나이 무료 등급 호출에 실패했습니다. 유료 모델로 전환하지 않았습니다.",
        503,
        "GEMINI_FREE_TIER_ERROR",
      );
    }
    const raw = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const resultSchema = z.object({
      results: z.array(z.object({
        questionKey: z.enum(questionKeys as [string, ...string[]]),
        categoryId: z.enum(candidateIds as [string, ...string[]]),
        confidence: z.number().min(0).max(1),
        reason: z.string().max(240),
      })).length(input.questions.length),
    });
    const result = resultSchema.safeParse(JSON.parse(text));
    if (!result.success || new Set(result.data.results.map((item) => item.questionKey)).size !== questionKeys.length) {
      return errorResponse("제미나이 분류 결과를 검증하지 못했습니다.", 502, "INVALID_GEMINI_RESULT");
    }
    return Response.json({
      results: result.data.results,
      model: FREE_TIER_MODEL,
      tier: "free-only",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "제미나이 무료 분류 응답 시간이 초과되었습니다."
      : "제미나이 무료 분류 중 오류가 발생했습니다.";
    return errorResponse(message, 503, "GEMINI_FREE_TIER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
