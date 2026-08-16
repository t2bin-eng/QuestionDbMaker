import type {
  GeminiClassificationRequest,
  GeminiClassificationResponse,
} from "./gemini-classification";

export async function classifyWithGeminiFreeTier(
  input: GeminiClassificationRequest,
): Promise<GeminiClassificationResponse> {
  const response = await fetch("/api/classify/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as (
    GeminiClassificationResponse & { error?: string }
  ) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "제미나이 무료 분류를 사용할 수 없습니다.");
  }
  return payload;
}
