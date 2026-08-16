import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export const DATABASE_BACKUP_MANIFEST = "question-card-studio-backup.json";
export const DATABASE_BACKUP_FORMAT = "question-card-studio-local-database";
export const DATABASE_BACKUP_VERSION = 1;

const ALLOWED_ROOTS = new Set(["documents", "metadata"]);
const MAX_BACKUP_SIZE = 1024 * 1024 * 1024;

export interface DatabaseBackupManifest {
  format: typeof DATABASE_BACKUP_FORMAT;
  version: typeof DATABASE_BACKUP_VERSION;
  exportedAt: string;
  fileCount: number;
}

export interface ParsedDatabaseBackup {
  manifest: DatabaseBackupManifest;
  files: Record<string, Uint8Array>;
  totalSize: number;
}

export function isSafeDatabaseBackupPath(path: string) {
  const segments = path.split("/");
  return !path.includes("\\") &&
    segments.length >= 2 &&
    ALLOWED_ROOTS.has(segments[0]) &&
    segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}

export function createDatabaseBackupArchive(
  files: Record<string, Uint8Array>,
  exportedAt = new Date().toISOString(),
) {
  const entries = Object.entries(files);
  if (entries.some(([path]) => !isSafeDatabaseBackupPath(path))) {
    throw new Error("백업할 파일 경로가 올바르지 않습니다.");
  }
  const manifest: DatabaseBackupManifest = {
    format: DATABASE_BACKUP_FORMAT,
    version: DATABASE_BACKUP_VERSION,
    exportedAt,
    fileCount: entries.length,
  };
  const archive: Zippable = {
    ...files,
    [DATABASE_BACKUP_MANIFEST]: strToU8(JSON.stringify(manifest, null, 2)),
  };
  return zipSync(archive, { level: 6 });
}

export function parseDatabaseBackupArchive(data: Uint8Array): ParsedDatabaseBackup {
  if (!data.byteLength || data.byteLength > MAX_BACKUP_SIZE) {
    throw new Error("백업 파일이 비어 있거나 1GB를 초과합니다.");
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(data);
  } catch {
    throw new Error("올바른 문항 DB 백업 ZIP이 아닙니다.");
  }

  const manifestBytes = archive[DATABASE_BACKUP_MANIFEST];
  if (!manifestBytes) throw new Error("문항 DB 백업 정보를 찾지 못했습니다.");

  let manifest: DatabaseBackupManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as DatabaseBackupManifest;
  } catch {
    throw new Error("문항 DB 백업 정보가 손상되었습니다.");
  }
  if (manifest.format !== DATABASE_BACKUP_FORMAT || manifest.version !== DATABASE_BACKUP_VERSION) {
    throw new Error("지원하지 않는 문항 DB 백업 형식입니다.");
  }

  const files = Object.fromEntries(
    Object.entries(archive).filter(([path]) => path !== DATABASE_BACKUP_MANIFEST),
  );
  const entries = Object.entries(files);
  if (entries.some(([path]) => !isSafeDatabaseBackupPath(path))) {
    throw new Error("백업 ZIP에 허용되지 않은 파일 경로가 있습니다.");
  }
  if (manifest.fileCount !== entries.length) {
    throw new Error("백업 파일 수가 백업 정보와 일치하지 않습니다.");
  }
  const totalSize = entries.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0);
  if (totalSize > MAX_BACKUP_SIZE) throw new Error("압축 해제된 백업 데이터가 1GB를 초과합니다.");

  return { manifest, files, totalSize };
}
