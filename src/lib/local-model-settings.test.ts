import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_MODEL_SETTINGS,
  normalizeLocalModelBaseUrl,
  readLocalModelSettings,
  saveLocalModelSettings,
} from "./local-model-settings";

describe("local Bionic model settings", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes OpenAI-compatible v1 URLs to the local server root", () => {
    expect(normalizeLocalModelBaseUrl("http://localhost:1234/v1/"))
      .toBe("http://127.0.0.1:1234");
  });

  it("uses Qwen 3.5 9B as the default local vision model", () => {
    expect(readLocalModelSettings()).toEqual(DEFAULT_LOCAL_MODEL_SETTINGS);
  });

  it("persists local-only connection settings", () => {
    saveLocalModelSettings({
      enabled: false,
      baseUrl: "http://localhost:1234/v1",
      model: "qwen/qwen3.5-9b",
      apiToken: "token",
    });
    expect(readLocalModelSettings()).toMatchObject({
      enabled: false,
      baseUrl: "http://127.0.0.1:1234",
      model: "qwen/qwen3.5-9b",
    });
  });
});
