import { describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import {
  createDatabaseBackupArchive,
  isSafeDatabaseBackupPath,
  parseDatabaseBackupArchive,
} from "./local-database-backup";

describe("local database backup", () => {
  it("round-trips documents and metadata", () => {
    const archive = createDatabaseBackupArchive({
      "documents/doc-1/document.json": new TextEncoder().encode('{"id":"doc-1"}'),
      "metadata/classification.json": new TextEncoder().encode('{"version":1}'),
    }, "2026-08-16T00:00:00.000Z");

    const parsed = parseDatabaseBackupArchive(archive);
    expect(parsed.manifest.fileCount).toBe(2);
    expect(parsed.manifest.exportedAt).toBe("2026-08-16T00:00:00.000Z");
    expect(strFromU8(parsed.files["documents/doc-1/document.json"])).toBe('{"id":"doc-1"}');
  });

  it("accepts only document and metadata paths", () => {
    expect(isSafeDatabaseBackupPath("documents/doc-1/source.pdf")).toBe(true);
    expect(isSafeDatabaseBackupPath("metadata/exam-sets.json")).toBe(true);
    expect(isSafeDatabaseBackupPath("../secrets.txt")).toBe(false);
    expect(isSafeDatabaseBackupPath("exports/old-backup.zip")).toBe(false);
    expect(isSafeDatabaseBackupPath("documents\\doc-1\\source.pdf")).toBe(false);
  });

  it("rejects a non-zip file", () => {
    expect(() => parseDatabaseBackupArchive(new TextEncoder().encode("not a zip")))
      .toThrow("올바른 문항 DB 백업 ZIP이 아닙니다.");
  });
});
