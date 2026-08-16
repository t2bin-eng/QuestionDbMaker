"use client";

export interface LocalModelSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiToken: string;
}

export const LOCAL_MODEL_SETTINGS_KEY = "question-card-studio:local-model";
export const DEFAULT_LOCAL_MODEL_SETTINGS: LocalModelSettings = {
  enabled: true,
  baseUrl: "http://127.0.0.1:1234",
  model: "qwen/qwen3.5-9b",
  apiToken: "",
};

export function normalizeLocalModelBaseUrl(value: string) {
  return value
    .trim()
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, "http://127.0.0.1")
    .replace(/\/+$/, "")
    .replace(/\/(?:api\/)?v1$/i, "");
}

export function readLocalModelSettings(): LocalModelSettings {
  if (typeof window === "undefined") return DEFAULT_LOCAL_MODEL_SETTINGS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_MODEL_SETTINGS_KEY) ?? "null") as Partial<LocalModelSettings> | null;
    if (!stored) return DEFAULT_LOCAL_MODEL_SETTINGS;
    return {
      enabled: stored.enabled ?? true,
      baseUrl: normalizeLocalModelBaseUrl(stored.baseUrl ?? DEFAULT_LOCAL_MODEL_SETTINGS.baseUrl),
      model: stored.model?.trim() || DEFAULT_LOCAL_MODEL_SETTINGS.model,
      apiToken: stored.apiToken?.trim() ?? "",
    };
  } catch {
    return DEFAULT_LOCAL_MODEL_SETTINGS;
  }
}

export function saveLocalModelSettings(settings: LocalModelSettings) {
  const normalized = {
    ...settings,
    baseUrl: normalizeLocalModelBaseUrl(settings.baseUrl),
    model: settings.model.trim(),
    apiToken: settings.apiToken.trim(),
  };
  window.localStorage.setItem(LOCAL_MODEL_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function localModelHeaders(settings: LocalModelSettings) {
  return {
    "Content-Type": "application/json",
    ...(settings.apiToken ? { Authorization: `Bearer ${settings.apiToken}` } : {}),
  };
}

export async function listLocalModelIds(settings: LocalModelSettings) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const request = new Request(`${normalizeLocalModelBaseUrl(settings.baseUrl)}/v1/models`, {
      method: "GET",
      mode: "cors",
      headers: settings.apiToken ? { Authorization: `Bearer ${settings.apiToken}` } : {},
      signal: controller.signal,
      targetAddressSpace: "loopback",
    } as RequestInit & { targetAddressSpace: "loopback" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Bionic 서버 응답 오류 (${response.status})`);
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    return (payload.data ?? []).flatMap((item) => item.id ? [item.id] : []);
  } finally {
    window.clearTimeout(timeout);
  }
}
