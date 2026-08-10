import { describe, expect, it } from "vitest";
import { buildLocalFilePath, isLocalDirectorySupported } from "./local-file-store";

describe("local file store", () => {
  it("builds a stable source PDF path", () => {
    expect(buildLocalFilePath("doc_123")).toBe("documents/doc_123/source.pdf");
  });

  it("reports unsupported when the directory picker is absent", () => {
    expect(isLocalDirectorySupported()).toBe(false);
  });
});
