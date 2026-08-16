import { describe, expect, it } from "vitest";
import { parseBionicJson } from "./bionic-vision-classifier";

describe("Bionic vision classifier response", () => {
  it("parses a fenced JSON result", () => {
    expect(parseBionicJson('```json\n{"majorName":"대한민국의 발전","categoryId":"industry","confidence":0.9}\n```'))
      .toMatchObject({ categoryId: "industry", confidence: 0.9 });
  });

  it("rejects a response without JSON", () => {
    expect(() => parseBionicJson("분류 결과입니다.")).toThrow(/JSON/);
  });
});
